import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import type { ProofVerification } from './types.js'

/**
 * Verify all LSAG ring signatures in a Veil-enhanced NIP-85 event.
 *
 * Checks each `veil_sig` tag against the `veil_ring`, confirms key images are
 * distinct (no double-signing), and validates the threshold is met.
 */
export function verifyProof(event: {
  kind: number
  tags: string[][]
  content: string
}): ProofVerification {
  const errors: string[] = []

  const ringTag = event.tags.find(t => t[0] === 'veil_ring')
  if (!ringTag) {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Missing veil_ring tag'] }
  }
  const ring = ringTag.slice(1)

  const thresholdTag = event.tags.find(t => t[0] === 'veil_threshold')
  const threshold = thresholdTag ? parseInt(thresholdTag[1], 10) : 0
  const circleSize = thresholdTag ? parseInt(thresholdTag[2], 10) : ring.length

  const sigTags = event.tags.filter(t => t[0] === 'veil_sig')
  if (sigTags.length === 0) {
    errors.push('No veil_sig tags found')
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

      if (hasDuplicateKeyImage(keyImage, keyImages)) {
        errors.push(`Duplicate key image at index ${i}`)
        continue
      }

      keyImages.push(keyImage)
      validSigs++
    } catch (e) {
      errors.push(`Failed to parse signature at index ${i}: ${(e as Error).message}`)
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
