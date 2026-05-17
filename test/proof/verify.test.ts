import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle, MAX_SCOPE_LENGTH } from '../../src/proof/circle.js'
import { contributeAssertion, contributeEventAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions, aggregateEventContributions } from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

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

  function makeV2Event() {
    const eventId = 'e1'.repeat(32)
    const contributions = privKeys.map((pk, i) =>
      contributeEventAssertion(
        circle,
        eventId,
        { rank: 85 },
        pk,
        circle.members.indexOf(pubKeys[i]),
        { proofVersion: 'v2' },
      ),
    )
    return aggregateEventContributions(circle, eventId, contributions, { proofVersion: 'v2' })
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

  it('rejects events without a d tag', () => {
    const event = makeEvent()
    event.tags = event.tags.filter(t => t[0] !== 'd')
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/Missing d tag/)
  })

  it('rejects events without a veil-threshold tag', () => {
    const event = makeEvent()
    event.tags = event.tags.filter(t => t[0] !== 'veil-threshold')
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/Missing veil-threshold/)
  })

  it('rejects events with unsorted veil-ring', () => {
    const event = makeEvent()
    const ringIdx = event.tags.findIndex(t => t[0] === 'veil-ring')
    const members = event.tags[ringIdx].slice(1)
    event.tags[ringIdx] = ['veil-ring', ...members.reverse()]
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/not in sorted order/)
  })

  it('rejects metric tags that differ from the signed contribution messages', () => {
    const event = makeEvent()
    const rankIdx = event.tags.findIndex(t => t[0] === 'rank')
    event.tags[rankIdx] = ['rank', '100']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /metric "rank"/i.test(e))).toBe(true)
  })

  it('rejects a veil-threshold circle size that differs from the ring size', () => {
    const event = makeEvent()
    const threshIdx = event.tags.findIndex(t => t[0] === 'veil-threshold')
    event.tags[threshIdx] = ['veil-threshold', '3', '999999']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.circleSize).toBe(3)
    expect(result.errors.some(e => /circle size/i.test(e))).toBe(true)
  })

  it('rejects a veil-threshold signer count that differs from valid signatures', () => {
    const event = makeEvent()
    const threshIdx = event.tags.findIndex(t => t[0] === 'veil-threshold')
    event.tags[threshIdx] = ['veil-threshold', '1', '3']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.distinctSigners).toBe(3)
    expect(result.errors.some(e => /signer count/i.test(e))).toBe(true)
  })

  it('verifies custom aggregation when the same aggregate function is supplied', () => {
    const contributions = privKeys.map((pk, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, subject, { rank: i === 0 ? 100 : 0 }, pk, memberIndex)
    })
    const max = (values: number[]) => Math.max(...values)
    const event = aggregateContributions(circle, subject, contributions, max)
    expect(verifyProof(event).valid).toBe(false)
    expect(verifyProof(event, max).valid).toBe(true)
  })

  it('verifies a named aggregate from the veil-agg tag without the function supplied', () => {
    const ranks = [70, 75, 95] // median 75, mean 80 -- distinct, so the tag must be honoured
    const contributions = privKeys.map((pk, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, subject, { rank: ranks[i] }, pk, memberIndex)
    })
    const event = aggregateContributions(circle, subject, contributions, { aggregate: 'mean' })
    expect(event.tags.find(t => t[0] === 'rank')?.[1]).toBe('80')
    expect(verifyProof(event).valid).toBe(true)
  })

  it('reports a clear error for a custom aggregate when no function is supplied', () => {
    const contributions = privKeys.map((pk, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, subject, { rank: 85 }, pk, memberIndex)
    })
    const max = (values: number[]) => Math.max(...values)
    const event = aggregateContributions(circle, subject, contributions, max)
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /custom/i.test(e))).toBe(true)
  })

  it('verifies an event with no veil-agg tag as median (backward compatible)', () => {
    const event = makeEvent()
    event.tags = event.tags.filter(t => t[0] !== 'veil-agg')
    expect(verifyProof(event).valid).toBe(true)
  })

  it('rejects an event whose veil-agg tag names an unknown function', () => {
    const event = makeEvent()
    const idx = event.tags.findIndex(t => t[0] === 'veil-agg')
    event.tags[idx] = ['veil-agg', 'frobnicate']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /veil-agg/i.test(e))).toBe(true)
  })

  function makeScopedEvent(scope: string) {
    const scoped = createTrustCircle(pubKeys, { scope })
    const contributions = privKeys.map((pk, i) =>
      contributeAssertion(scoped, subject, { rank: 85 }, pk, scoped.members.indexOf(pubKeys[i])),
    )
    return aggregateContributions(scoped, subject, contributions)
  }

  it('verifies an aggregated event from a scoped circle', () => {
    const event = makeScopedEvent('fed-1')
    expect(event.tags).toContainEqual(['veil-scope', 'fed-1'])
    expect(verifyProof(event).valid).toBe(true)
  })

  it('verifies an event with no veil-scope tag as circle-scoped (backward compatible)', () => {
    const event = makeEvent()
    expect(event.tags.find(t => t[0] === 'veil-scope')).toBeUndefined()
    expect(verifyProof(event).valid).toBe(true)
  })

  it('rejects an event whose veil-scope tag has been altered', () => {
    const event = makeScopedEvent('fed-1')
    const idx = event.tags.findIndex(t => t[0] === 'veil-scope')
    event.tags[idx] = ['veil-scope', 'fed-2']
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /electionId mismatch/.test(e))).toBe(true)
  })

  it('rejects a veil-scope tag added to an otherwise circle-scoped event', () => {
    const event = makeEvent()
    event.tags.push(['veil-scope', 'fed-1'])
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /electionId mismatch/.test(e))).toBe(true)
  })

  it('rejects an event with multiple veil-scope tags', () => {
    const event = makeEvent()
    event.tags.push(['veil-scope', 'fed-1'], ['veil-scope', 'fed-2'])
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /Multiple veil-scope/.test(e))).toBe(true)
  })

  it('rejects an event whose veil-scope tag exceeds the maximum length', () => {
    const event = makeEvent()
    event.tags.push(['veil-scope', 'x'.repeat(MAX_SCOPE_LENGTH + 1)])
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /veil-scope exceeds/.test(e))).toBe(true)
  })

  it('rejects an event whose veil-scope tag is not a valid slug', () => {
    const event = makeEvent()
    event.tags.push(['veil-scope', 'has spaces'])
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /slug/.test(e))).toBe(true)
  })

  it('verifies v2 proofs and rejects v1 proofs when v2 is required', () => {
    expect(verifyProof(makeV2Event(), { requireProofVersion: 'v2' }).valid).toBe(true)

    const v1Result = verifyProof(makeEvent(), { requireProofVersion: 'v2' })
    expect(v1Result.valid).toBe(false)
    expect(v1Result.errors.some(e => /proof version/i.test(e))).toBe(true)
  })

  it('rejects a v2 proof if the event kind is changed', () => {
    const event = makeV2Event()
    event.kind = NIP85_KINDS.USER
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /kind mismatch/i.test(e))).toBe(true)
  })

  it('rejects a v2 proof if the bound subject tag is changed', () => {
    const event = makeV2Event()
    const eIdx = event.tags.findIndex(t => t[0] === 'e')
    event.tags[eIdx] = ['e', 'f1'.repeat(32)]
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /subject tag/i.test(e))).toBe(true)
  })

  it('rejects a v2 proof if the bound subject tag is missing', () => {
    const event = makeV2Event()
    event.tags = event.tags.filter(t => t[0] !== 'e')
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /subject tag/i.test(e))).toBe(true)
  })

  it('rejects an oversized veil-sig payload before processing the signature', () => {
    const event = makeEvent()
    const sigIdx = event.tags.findIndex(t => t[0] === 'veil-sig')
    event.tags[sigIdx][1] = 'x'.repeat(200_000)
    const result = verifyProof(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /signature payload/i.test(e))).toBe(true)
  })
})
