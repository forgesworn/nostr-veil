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
  // Explicit sorted-key serialisation for deterministic output.
  // The `ring` and `keyImage` fields are excluded — ring is in the
  // veil-ring tag and keyImage is the third element of the veil-sig tag.
  const obj: Record<string, unknown> = {
    c0: sig.c0,
    electionId: sig.electionId,
    message: sig.message,
    responses: sig.responses,
  }
  if (sig.domain !== undefined) {
    obj.domain = sig.domain
  }
  return JSON.stringify(obj, Object.keys(obj).sort())
}

/**
 * Aggregate multiple anonymous contributions into a single NIP-85 event.
 *
 * Validates all LSAG signatures and checks key image uniqueness before
 * aggregating metrics (default: median). The result is a standard kind 30382
 * event with additional `veil-ring`, `veil-threshold`, and `veil-sig` tags.
 *
 * @param circle - Trust circle the contributions belong to
 * @param subject - The d-tag value (must match what contributors signed)
 * @param contributions - Array of {@link Contribution} objects from circle members
 * @param aggregateFn - Function to combine metric values (default: median). Receives an array of numbers, returns a single number.
 * @returns An unsigned {@link EventTemplate} (kind 30382) with proof tags — sign and publish as a standard Nostr event
 * @throws If any LSAG signature is invalid or duplicate key images are detected
 */
export function aggregateContributions(
  circle: TrustCircle,
  subject: string,
  contributions: Contribution[],
  aggregateFn: AggregateFn = median
): EventTemplate {
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
    aggregatedMetrics[key] = aggregateFn(values)
  }

  const metricTags = Object.entries(aggregatedMetrics).map(([k, v]) => [k, String(v)])
  const sigTags = contributions.map(c => ['veil-sig', serialiseSig(c.signature), c.keyImage])

  return {
    kind: NIP85_KINDS.USER,
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
