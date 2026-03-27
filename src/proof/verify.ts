import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import { computeCircleId } from './circle.js'
import type { ProofVerification } from './types.js'

/**
 * Verify all LSAG ring signatures in a Veil-enhanced NIP-85 event.
 *
 * Checks each `veil-sig` tag against the `veil-ring`, confirms key images are
 * distinct (no double-signing), and validates the threshold is met.
 *
 * @param event - A Nostr event (or template) containing `veil-ring`, `veil-threshold`, and `veil-sig` tags
 * @returns A {@link ProofVerification} with `valid`, `circleSize`, `threshold`, `distinctSigners`, and any `errors`
 */
const MAX_RING_SIZE = 1000

export function verifyProof(event: {
  kind: number
  tags: string[][]
  content: string
}): ProofVerification {
  const errors: string[] = []

  const ringTag = event.tags.find(t => t[0] === 'veil-ring')
  if (!ringTag) {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Missing veil-ring tag'] }
  }
  const ring = ringTag.slice(1)

  // Guard against relay-supplied DoS: unbounded ring inflates memory + verification time
  if (ring.length > MAX_RING_SIZE) {
    return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: [`veil-ring exceeds maximum size (${MAX_RING_SIZE})`] }
  }

  const thresholdTag = event.tags.find(t => t[0] === 'veil-threshold')
  const threshold = thresholdTag ? parseInt(thresholdTag[1], 10) : ring.length
  const circleSize = thresholdTag ? parseInt(thresholdTag[2], 10) : ring.length

  // Validate threshold is a sane integer
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > ring.length) {
    errors.push(`Invalid threshold: ${thresholdTag?.[1] ?? 'missing'}`)
    return { valid: false, circleSize, threshold: 0, distinctSigners: 0, errors }
  }

  const sigTags = event.tags.filter(t => t[0] === 'veil-sig')
  if (sigTags.length === 0) {
    errors.push('No veil-sig tags found')
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }

  // Cap sig tags at ring size — legitimate events cannot have more sigs than members
  if (sigTags.length > ring.length) {
    errors.push(`Too many veil-sig tags (${sigTags.length}) for ring of size ${ring.length}`)
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }

  const keyImages: string[] = []
  let validSigs = 0

  for (let i = 0; i < sigTags.length; i++) {
    try {
      const sigData = JSON.parse(sigTags[i][1])
      const keyImage = sigTags[i][2]
      const fullSig = { ...sigData, keyImage, ring }

      if (!lsagVerify(fullSig)) {
        errors.push(`Invalid LSAG signature at index ${i}`)
        continue
      }

      // Bind the signature to this event's subject: the electionId must match
      // the pattern veil:v1:<circleId>:<subject> derived from the ring and d-tag.
      // Without this check, valid signatures could be transplanted between events.
      const dTag = event.tags.find(t => t[0] === 'd')
      if (dTag && typeof sigData.electionId === 'string') {
        const expectedCircleId = computeCircleId([...ring].sort())
        const expectedElectionId = `veil:v1:${expectedCircleId}:${dTag[1]}`
        if (sigData.electionId !== expectedElectionId) {
          errors.push(`Signature at index ${i} electionId mismatch: expected "${expectedElectionId}" but got "${sigData.electionId}"`)
          continue
        }
      }

      if (hasDuplicateKeyImage(keyImage, keyImages)) {
        errors.push(`Duplicate key image at index ${i}`)
        continue
      }

      keyImages.push(keyImage)
      validSigs++
    } catch (e) {
      errors.push(`Failed to process signature at index ${i}`)
    }
  }

  return {
    valid: errors.length === 0 && validSigs >= threshold,
    circleSize,
    threshold,
    distinctSigners: validSigs,
    errors,
  }
}
