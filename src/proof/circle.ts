import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { TrustCircle } from './types.js'

/** Compute a deterministic circle ID by SHA-256 hashing the colon-joined sorted pubkeys. */
export function computeCircleId(sortedPubkeys: string[]): string {
  const input = sortedPubkeys.join(':')
  return bytesToHex(sha256(new TextEncoder().encode(input)))
}

/** Produce the canonical JSON message that contributors sign with LSAG. */
export function canonicalMessage(
  circleId: string,
  subject: string,
  metrics: Record<string, number>
): string {
  const sortedMetrics: Record<string, number> = {}
  for (const key of Object.keys(metrics).sort()) {
    sortedMetrics[key] = metrics[key]
  }
  return JSON.stringify({ circleId, metrics: sortedMetrics, subject })
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
