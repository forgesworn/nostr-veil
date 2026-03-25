import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { TrustCircle } from './types.js'

/** Compute a deterministic circle ID by SHA-256 hashing the colon-joined sorted pubkeys. */
export function computeCircleId(sortedPubkeys: string[]): string {
  const input = sortedPubkeys.join(':')
  return bytesToHex(sha256(new TextEncoder().encode(input)))
}

/**
 * Produce the canonical JSON message that contributors sign with LSAG.
 *
 * All object keys (top-level and within metrics) are explicitly sorted to
 * guarantee deterministic output regardless of property insertion order.
 * Metric values must be finite numbers — NaN/Infinity would serialise as
 * `null`, breaking cross-platform determinism.
 */
export function canonicalMessage(
  circleId: string,
  subject: string,
  metrics: Record<string, number>
): string {
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Metric "${key}" must be a finite number, got ${value}`)
    }
  }
  const sortedMetrics: Record<string, number> = {}
  for (const key of Object.keys(metrics).sort()) {
    sortedMetrics[key] = metrics[key]
  }
  // Top-level keys are explicitly alphabetical: circleId < metrics < subject.
  // Using a replacer function to sort keys at every nesting level, ensuring
  // deterministic output independent of object literal insertion order.
  const obj = { circleId, metrics: sortedMetrics, subject }
  return JSON.stringify(obj, (_key: string, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k]
      }
      return sorted
    }
    return value
  })
}

/** Create a trust circle from an array of hex pubkeys. Requires at least 2 unique members. */
export function createTrustCircle(memberPubkeys: string[]): TrustCircle {
  if (memberPubkeys.length < 2) {
    throw new Error('Trust circle requires at least 2 members')
  }
  const sorted = [...memberPubkeys].sort()
  const seen = new Set<string>()
  for (const pk of sorted) {
    if (seen.has(pk)) throw new Error(`Duplicate pubkey in trust circle: ${pk}`)
    seen.add(pk)
  }
  return {
    members: sorted,
    circleId: computeCircleId(sorted),
    size: sorted.length,
  }
}
