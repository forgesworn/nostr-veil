import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions } from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'

describe('verifyProof', () => {
  const privKeys = [
    '0101010101010101010101010101010101010101010101010101010101010101',
    '0202020202020202020202020202020202020202020202020202020202020202',
    '0303030303030303030303030303030303030303030303030303030303030303',
  ]
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(k)))
  const circle = createTrustCircle(pubKeys)
  const subject = 'dd'.repeat(32)

  function makeEvent() {
    const contributions = privKeys.map((pk, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, subject, { rank: 85 }, pk, memberIndex)
    })
    return aggregateContributions(circle, subject, contributions)
  }

  it('returns valid for a correctly constructed event', () => {
    const event = makeEvent()
    const result = verifyProof(event)
    expect(result.valid).toBe(true)
    expect(result.circleSize).toBe(3)
    expect(result.threshold).toBe(3)
    expect(result.distinctSigners).toBe(3)
    expect(result.errors).toHaveLength(0)
  })

  it('returns invalid if veil_ring tag is missing', () => {
    const event = makeEvent()
    event.tags = event.tags.filter(t => t[0] !== 'veil_ring')
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/veil_ring/)
  })

  it('returns invalid if a signature is corrupted', () => {
    const event = makeEvent()
    const sigIdx = event.tags.findIndex(t => t[0] === 'veil_sig')
    const sig = JSON.parse(event.tags[sigIdx][1])
    sig.c0 = 'ff'.repeat(32)
    event.tags[sigIdx][1] = JSON.stringify(sig)
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
  })

  it('returns invalid for non-veil events (no proof tags)', () => {
    const event = { kind: 30382, tags: [['d', 'x'], ['rank', '50']], content: '' }
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/veil_ring/)
  })

  it('returns invalid when threshold exceeds actual signatures', () => {
    const event = makeEvent()
    const threshIdx = event.tags.findIndex(t => t[0] === 'veil_threshold')
    event.tags[threshIdx] = ['veil_threshold', '5', '8']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.distinctSigners).toBe(3)
  })
})
