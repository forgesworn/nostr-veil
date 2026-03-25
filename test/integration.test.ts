import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  createTrustCircle,
  contributeAssertion,
  aggregateContributions,
  verifyProof,
  validateAssertion,
  signEvent,
} from '../src/index.js'

describe('end-to-end whistleblower scenario', () => {
  const privKeys = [
    '0101010101010101010101010101010101010101010101010101010101010101',
    '0202020202020202020202020202020202020202020202020202020202020202',
    '0303030303030303030303030303030303030303030303030303030303030303',
    '0404040404040404040404040404040404040404040404040404040404040404',
    '0505050505050505050505050505050505050505050505050505050505050505',
  ]
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
  const sourceSubject = 'ff'.repeat(32)

  it('full flow: circle -> contribute -> aggregate -> verify', { timeout: 30_000 }, () => {
    // 1. Create the trust circle
    const circle = createTrustCircle(pubKeys)
    expect(circle.size).toBe(5)

    // 2. Each journalist contributes a score
    const contributions = privKeys.map((pk, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, sourceSubject, { rank: 80 + i * 2 }, pk, memberIndex)
    })

    // 3. Aggregate into a single NIP-85 assertion
    const event = aggregateContributions(circle, sourceSubject, contributions)
    expect(event.kind).toBe(30382)

    // 4. Validate as NIP-85
    const validation = validateAssertion(event)
    expect(validation.valid).toBe(true)

    // 5. Verify the ring signature proofs
    const proof = verifyProof(event)
    expect(proof.valid).toBe(true)
    expect(proof.distinctSigners).toBe(5)
    expect(proof.circleSize).toBe(5)

    // 6. Sign the event
    const signed = signEvent(event, privKeys[0])
    expect(signed.sig).toMatch(/^[0-9a-f]{128}$/)
  })

  it('partial contributions work (3 of 5)', { timeout: 30_000 }, () => {
    const circle = createTrustCircle(pubKeys)

    // Only 3 of 5 contribute
    const contributions = privKeys.slice(0, 3).map((pk, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, sourceSubject, { rank: 80 + i * 5 }, pk, memberIndex)
    })

    const event = aggregateContributions(circle, sourceSubject, contributions)
    const proof = verifyProof(event)
    expect(proof.valid).toBe(true)
    expect(proof.distinctSigners).toBe(3)
    expect(proof.threshold).toBe(3)
    expect(proof.circleSize).toBe(5)
  })
})
