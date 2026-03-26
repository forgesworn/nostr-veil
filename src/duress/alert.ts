import {
  deriveDuressKey,
  buildDuressAlert,
  encryptDuressAlert,
} from 'canary-kit/beacon'

export { decryptDuressAlert } from 'canary-kit/beacon'

/**
 * Propagate a duress alert for a group member.
 *
 * Derives an AES-256 key from the group seed, builds a duress alert payload,
 * and encrypts it with AES-256-GCM. Returns the encrypted base64 string
 * ready for Nostr event content.
 *
 * @param memberPubkey - 64-character lowercase hex pubkey of the member under duress.
 * @param groupSeed - 64-character lowercase hex group seed (32 bytes).
 * @param location - Optional geohash location with precision, or null/undefined.
 * @returns Encrypted base64 string.
 */
export async function propagateDuressAlert(
  memberPubkey: string,
  groupSeed: string,
  location?: { geohash: string; precision: number } | null,
): Promise<string> {
  const key = deriveDuressKey(groupSeed)
  const alert = buildDuressAlert(
    memberPubkey,
    location ? { ...location, locationSource: 'beacon' as const } : null,
  )
  return encryptDuressAlert(key, alert)
}
