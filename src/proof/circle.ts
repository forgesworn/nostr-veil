import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { TrustCircle } from './types.js'

/**
 * Compute a deterministic circle ID by SHA-256 hashing the colon-joined sorted pubkeys.
 *
 * @param sortedPubkeys - Array of hex pubkeys already in sorted (lexicographic) order
 * @returns A 64-char hex SHA-256 digest that uniquely identifies this exact group membership
 *
 * @example
 * const id = computeCircleId([alicePubkey, bobPubkey].sort())
 * // '3f4a2b…' (64-char hex string)
 */
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
 *
 * @param circleId - The circle's deterministic ID from {@link computeCircleId}
 * @param subject - The d-tag value (hex pubkey for kind 30382, event ID for kind 30383, etc.)
 * @param metrics - Key-value pairs of metric names to finite numeric values
 * @returns A deterministic JSON string suitable for LSAG signing
 *
 * @throws If any metric value is NaN or non-finite (Infinity / -Infinity)
 *
 * @example
 * const msg = canonicalMessage(circle.circleId, subjectPubkey, { rank: 85, followers: 1200 })
 * // '{"circleId":"…","metrics":{"followers":1200,"rank":85},"subject":"…"}'
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

/**
 * Create a trust circle from an array of hex pubkeys. Requires at least 2 unique members.
 *
 * The input array is sorted internally — the caller need not pre-sort. Each pubkey must
 * appear exactly once; duplicates cause an immediate throw.
 *
 * @param memberPubkeys - Array of hex-encoded x-only public keys (64 chars each)
 * @returns A {@link TrustCircle} with a stable `members` order and a deterministic `circleId`
 *
 * @throws If fewer than 2 pubkeys are supplied
 * @throws If any pubkey appears more than once in the array
 *
 * @example
 * const circle = createTrustCircle([alicePubkey, bobPubkey, carolPubkey])
 * // { members: ['alice…', 'bob…', 'carol…'], circleId: '3f4a…', size: 3 }
 */
export function createTrustCircle(memberPubkeys: string[]): TrustCircle {
  if (memberPubkeys.length < 2) {
    throw new Error('Trust circle requires at least 2 members')
  }
  const HEX64_RE = /^[0-9a-f]{64}$/
  const sorted = [...memberPubkeys].sort()
  const seen = new Set<string>()
  for (const pk of sorted) {
    if (!HEX64_RE.test(pk)) throw new Error(`Invalid pubkey format: expected 64-char lowercase hex`)
    if (seen.has(pk)) throw new Error(`Duplicate pubkey in trust circle: ${pk}`)
    seen.add(pk)
  }
  return {
    members: sorted,
    circleId: computeCircleId(sorted),
    size: sorted.length,
  }
}
