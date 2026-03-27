import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import type { EventTemplate } from '../nip85/types.js'
import { NIP85_KINDS } from '../nip85/types.js'
import type { TrustCircle, Contribution, AggregateFn } from './types.js'

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
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

/**
 * Aggregate multiple anonymous contributions into a single NIP-85 event.
 *
 * Validates all LSAG signatures and checks key image uniqueness before
 * aggregating metrics (default: median). The result is a standard NIP-85
 * event with additional `veil-ring`, `veil-threshold`, and `veil-sig` tags.
 *
 * @param circle - Trust circle the contributions belong to
 * @param subject - The d-tag value (must match what contributors signed)
 * @param contributions - Array of {@link Contribution} objects from circle members
 * @param options - Optional configuration
 * @param options.aggregateFn - Function to combine metric values (default: median). Receives an array of numbers, returns a single number.
 * @param options.kind - NIP-85 assertion kind (default: 30382 USER). Use `NIP85_KINDS.EVENT` (30383), `NIP85_KINDS.ADDRESSABLE` (30384), or `NIP85_KINDS.IDENTIFIER` (30385) for other assertion types.
 * @returns An unsigned {@link EventTemplate} with proof tags — sign and publish as a standard Nostr event
 * @throws If any LSAG signature is invalid or duplicate key images are detected
 */
export function aggregateContributions(
  circle: TrustCircle,
  subject: string,
  contributions: Contribution[],
  options?: AggregateFn | { aggregateFn?: AggregateFn; kind?: number }
): EventTemplate {
  const aggregateFn = typeof options === 'function'
    ? options
    : options?.aggregateFn ?? median
  const kind = typeof options === 'object' && options !== null && 'kind' in options
    ? options.kind ?? NIP85_KINDS.USER
    : NIP85_KINDS.USER
  // Validate all signatures
  for (let i = 0; i < contributions.length; i++) {
    if (!lsagVerify(contributions[i].signature)) {
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
      ...sigTags,
    ],
    content: '',
  }
}
