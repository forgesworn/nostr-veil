import { lsagSign } from '@forgesworn/ring-sig'
import type { TrustCircle, Contribution } from './types.js'
import { canonicalMessage } from './circle.js'

/**
 * Produce an anonymous contribution to a trust circle assertion.
 *
 * Signs the canonical message with an LSAG ring signature so the contributor's
 * identity is hidden within the ring. The key image prevents double-signing.
 *
 * @param circle - Trust circle created via {@link createTrustCircle}
 * @param subject - The d-tag value (hex pubkey for kind 30382)
 * @param metrics - Metric key-value pairs (e.g. `{ rank: 85, followers: 1200 }`)
 * @param privateKey - 32-byte hex private key of the contributing member
 * @param memberIndex - 0-based index of this member in `circle.members` (sorted order)
 * @returns A {@link Contribution} containing the LSAG signature, key image, and metrics
 * @throws If `memberIndex` is out of range or the private key doesn't match the pubkey at that index
 */
export function contributeAssertion(
  circle: TrustCircle,
  subject: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number
): Contribution {
  const message = canonicalMessage(circle.circleId, subject, metrics)
  const electionId = `veil:v1:${circle.circleId}:${subject}`

  const signature = lsagSign(message, circle.members, memberIndex, privateKey, electionId)

  return {
    signature,
    keyImage: signature.keyImage,
    metrics: { ...metrics },
  }
}
