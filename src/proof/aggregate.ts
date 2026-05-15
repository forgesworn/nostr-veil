import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import type { EventTemplate } from '../nip85/types.js'
import { NIP85_KINDS } from '../nip85/types.js'
import type { TrustCircle, Contribution, AggregateFn, AggregateName } from './types.js'
import { canonicalMessage, computeCircleId } from './circle.js'

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * Built-in named aggregate functions. The `veil-agg` tag records which one
 * produced an event's metric tags, letting `verifyProof` recompute the
 * aggregate without the function being supplied out-of-band.
 */
export const AGGREGATES: Record<AggregateName, AggregateFn> = {
  median,
  mean: values => Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  sum: values => values.reduce((a, b) => a + b, 0),
  min: values => Math.min(...values),
  max: values => Math.max(...values),
}

/** True if `name` is a recognised built-in aggregate function. */
export function isAggregateName(name: string): name is AggregateName {
  return Object.prototype.hasOwnProperty.call(AGGREGATES, name)
}

function serialiseSig(sig: Contribution['signature']): string {
  // Deterministic sorted-key serialisation. The `ring` and `keyImage` fields
  // are excluded — ring is in the veil-ring tag, keyImage is the third element
  // of the veil-sig tag. Uses a replacer function (not an array allowlist)
  // to guarantee alphabetical key order across all JS engines.
  const obj: Record<string, unknown> = {
    c0: sig.c0,
    electionId: sig.electionId,
    message: sig.message,
    responses: sig.responses,
  }
  if (sig.domain !== undefined) {
    obj.domain = sig.domain
  }
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k]
    }
    return sorted
  })
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Aggregate multiple anonymous contributions into a single NIP-85 event.
 *
 * Validates all LSAG signatures and checks key image uniqueness before
 * aggregating metrics (default: median). The result is a standard NIP-85
 * event with additional `veil-ring`, `veil-threshold`, `veil-agg`, and `veil-sig` tags.
 *
 * @param circle - Trust circle the contributions belong to
 * @param subject - The d-tag value (must match what contributors signed)
 * @param contributions - Array of {@link Contribution} objects from circle members
 * @param options - Optional configuration
 * @param options.aggregate - Name of a built-in aggregate function: 'median' (default), 'mean', 'sum', 'min', or 'max'. Recorded in the `veil-agg` tag so verifiers can recompute the aggregate automatically.
 * @param options.aggregateFn - A custom function to combine metric values. Recorded as `veil-agg: custom`; verifiers must be passed the same function. Prefer `aggregate` for the standard functions.
 * @param options.kind - NIP-85 assertion kind (default: 30382 USER). Use `NIP85_KINDS.EVENT` (30383), `NIP85_KINDS.ADDRESSABLE` (30384), or `NIP85_KINDS.IDENTIFIER` (30385) for other assertion types.
 * @returns An unsigned {@link EventTemplate} with proof tags — sign and publish as a standard Nostr event
 * @throws If any LSAG signature is invalid, duplicate key images are detected, or an unknown aggregate name is supplied
 */
export function aggregateContributions(
  circle: TrustCircle,
  subject: string,
  contributions: Contribution[],
  options?: AggregateFn | { aggregateFn?: AggregateFn; aggregate?: AggregateName; kind?: number }
): EventTemplate {
  let aggregateFn: AggregateFn
  let aggName: AggregateName | 'custom'
  if (typeof options === 'function') {
    aggregateFn = options
    aggName = 'custom'
  } else if (options?.aggregate !== undefined) {
    if (!isAggregateName(options.aggregate)) {
      throw new Error(`Unknown aggregate function: ${options.aggregate}`)
    }
    aggregateFn = AGGREGATES[options.aggregate]
    aggName = options.aggregate
  } else if (options?.aggregateFn !== undefined) {
    aggregateFn = options.aggregateFn
    aggName = 'custom'
  } else {
    aggregateFn = median
    aggName = 'median'
  }
  const kind = typeof options === 'object' && options !== null && 'kind' in options
    ? options.kind ?? NIP85_KINDS.USER
    : NIP85_KINDS.USER
  if (circle.size !== circle.members.length) {
    throw new Error(`Trust circle size mismatch: size=${circle.size}, members=${circle.members.length}`)
  }
  if (circle.circleId !== computeCircleId(circle.members)) {
    throw new Error('Trust circle circleId does not match its members')
  }

  const expectedElectionId = `veil:v1:${circle.circleId}:${subject}`

  // Validate all signatures
  for (let i = 0; i < contributions.length; i++) {
    const contribution = contributions[i]
    if (contribution.keyImage !== contribution.signature.keyImage) {
      throw new Error(`Detached key image does not match signature at contribution index ${i}`)
    }
    if (!sameStringArray(contribution.signature.ring, circle.members)) {
      throw new Error(`Signature ring does not match trust circle at contribution index ${i}`)
    }
    if (contribution.signature.electionId !== expectedElectionId) {
      throw new Error(`Signature electionId does not match trust circle subject at contribution index ${i}`)
    }
    if (contribution.signature.message !== canonicalMessage(circle.circleId, subject, contribution.metrics)) {
      throw new Error(`Signature signed message does not match contribution metrics at contribution index ${i}`)
    }
    if (!lsagVerify(contribution.signature)) {
      throw new Error(`Invalid LSAG signature at contribution index ${i}`)
    }
  }

  // Check key image uniqueness
  const keyImages: string[] = []
  for (const c of contributions) {
    if (hasDuplicateKeyImage(c.keyImage, keyImages)) {
      throw new Error(`Duplicate key image detected: ${c.keyImage}`)
    }
    keyImages.push(c.keyImage)
  }

  // Aggregate metrics
  const allMetricKeys = new Set<string>()
  for (const c of contributions) {
    for (const key of Object.keys(c.metrics)) allMetricKeys.add(key)
  }
  const aggregatedMetrics: Record<string, number> = {}
  for (const key of allMetricKeys) {
    const values = contributions.map(c => c.metrics[key]).filter((v): v is number => v !== undefined)
    const aggregated = aggregateFn(values)
    if (!Number.isFinite(aggregated)) {
      throw new Error(`aggregateFn returned non-finite value for metric "${key}": ${aggregated}`)
    }
    aggregatedMetrics[key] = aggregated
  }

  const metricTags = Object.entries(aggregatedMetrics).map(([k, v]) => [k, String(v)])
  const sigTags = contributions.map(c => ['veil-sig', serialiseSig(c.signature), c.keyImage])

  return {
    kind,
    tags: [
      ['d', subject],
      ['p', subject],
      ...metricTags,
      ['veil-ring', ...circle.members],
      ['veil-threshold', String(contributions.length), String(circle.size)],
      ['veil-agg', aggName],
      ...sigTags,
    ],
    content: '',
  }
}
