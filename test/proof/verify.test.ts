import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
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
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
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

  it('returns invalid if veil-ring tag is missing', () => {
    const event = makeEvent()
    event.tags = event.tags.filter(t => t[0] !== 'veil-ring')
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/veil-ring/)
  })

  it('returns invalid if a signature is corrupted', () => {
    const event = makeEvent()
    const sigIdx = event.tags.findIndex(t => t[0] === 'veil-sig')
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
    expect(result.errors[0]).toMatch(/veil-ring/)
  })

  it('returns invalid when threshold exceeds ring size', () => {
    const event = makeEvent()
    const threshIdx = event.tags.findIndex(t => t[0] === 'veil-threshold')
    event.tags[threshIdx] = ['veil-threshold', '5', '8']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/Invalid threshold/)
  })

  it('rejects signature transplant: valid sigs from subject A placed on event for subject B', () => {
    const eventA = makeEvent()
    const differentSubject = 'ee'.repeat(32)
    // Transplant all tags except d-tag onto a different subject
    const transplanted = {
      kind: eventA.kind,
      tags: eventA.tags.map(t => t[0] === 'd' ? ['d', differentSubject] : t[0] === 'p' ? ['p', differentSubject] : t),
      content: eventA.content,
    }
    const result = verifyProof(transplanted)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /electionId mismatch/.test(e))).toBe(true)
  })

  it('rejects signatures with missing electionId (bypass attempt)', () => {
    const event = makeEvent()
    const sigIdx = event.tags.findIndex(t => t[0] === 'veil-sig')
    const sig = JSON.parse(event.tags[sigIdx][1])
    delete sig.electionId
    event.tags[sigIdx][1] = JSON.stringify(sig)
    const result = verifyProof(event)
    // LSAG verification itself fails without electionId (it's part of the signed structure),
    // so the signature is rejected before we even reach the binding check
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
