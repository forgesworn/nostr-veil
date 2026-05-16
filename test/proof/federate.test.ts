import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions } from '../../src/proof/aggregate.js'
import { verifyFederation } from '../../src/proof/federate.js'

describe('verifyFederation', () => {
  const privKeys = ['01', '02', '03', '04', '05'].map(b => b.repeat(32))
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
  const signers = privKeys.map((priv, i) => ({ priv, pub: pubKeys[i] }))
  const subject = 'dd'.repeat(32)

  function scopedEvent(members: typeof signers, scope: string, subj: string = subject) {
    const circle = createTrustCircle(members.map(m => m.pub), { scope })
    const contributions = members.map(m =>
      contributeAssertion(circle, subj, { rank: 80 }, m.priv, circle.members.indexOf(m.pub)),
    )
    return aggregateContributions(circle, subj, contributions)
  }

  it('deduplicates a contributor shared between two circles', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[0], signers[2]], 'fed-1')
    const result = verifyFederation([a, b])
    expect(result.valid).toBe(true)
    expect(result.circleCount).toBe(2)
    expect(result.totalSignatures).toBe(4)
    expect(result.distinctSigners).toBe(3) // signer 0 is in both circles, counted once
    expect(result.subject).toBe(subject)
    expect(result.scope).toBe('fed-1')
    expect(result.errors).toHaveLength(0)
  })

  it('counts every contributor when the circles do not overlap', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[2], signers[3]], 'fed-1')
    const result = verifyFederation([a, b])
    expect(result.valid).toBe(true)
    expect(result.totalSignatures).toBe(4)
    expect(result.distinctSigners).toBe(4)
  })

  it('counts a contributor present in every circle exactly once', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[0], signers[2]], 'fed-1')
    const c = scopedEvent([signers[0], signers[3]], 'fed-1')
    const result = verifyFederation([a, b, c])
    expect(result.valid).toBe(true)
    expect(result.circleCount).toBe(3)
    expect(result.totalSignatures).toBe(6)
    expect(result.distinctSigners).toBe(4)
  })

  it('does not deduplicate distinct contributors that share identical metrics', () => {
    // every contribution is { rank: 80 }: dedup must key on the LSAG key image, not content
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[2], signers[3]], 'fed-1')
    expect(verifyFederation([a, b]).distinctSigners).toBe(4)
  })

  it('verifies a federation of a single scoped event', () => {
    const result = verifyFederation([scopedEvent([signers[0], signers[1]], 'fed-1')])
    expect(result.valid).toBe(true)
    expect(result.circleCount).toBe(1)
    expect(result.distinctSigners).toBe(2)
  })

  it('rejects an empty event list', () => {
    const result = verifyFederation([])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/at least one event/)
  })

  it('rejects a federation whose events use different scopes', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[0], signers[2]], 'fed-2')
    const result = verifyFederation([a, b])
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /different scopes/.test(e))).toBe(true)
  })

  it('rejects a federation whose events are about different subjects', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1', 'aa'.repeat(32))
    const b = scopedEvent([signers[0], signers[2]], 'fed-1', 'bb'.repeat(32))
    const result = verifyFederation([a, b])
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /different subjects/.test(e))).toBe(true)
  })

  it('rejects an unscoped circle-scoped event in the federation', () => {
    const scoped = scopedEvent([signers[0], signers[1]], 'fed-1')
    const circle = createTrustCircle([signers[0].pub, signers[2].pub])
    const unscoped = aggregateContributions(
      circle,
      subject,
      [signers[0], signers[2]].map(m =>
        contributeAssertion(circle, subject, { rank: 80 }, m.priv, circle.members.indexOf(m.pub)),
      ),
    )
    const result = verifyFederation([scoped, unscoped])
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /event\[1\]/.test(e) && /federation-scoped/.test(e))).toBe(true)
  })

  it('rejects a federation containing an event that fails verification', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[0], signers[2]], 'fed-1')
    const sigIdx = b.tags.findIndex(t => t[0] === 'veil-sig')
    const sig = JSON.parse(b.tags[sigIdx][1])
    sig.c0 = 'ff'.repeat(32)
    b.tags[sigIdx][1] = JSON.stringify(sig)
    const result = verifyFederation([a, b])
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /^event\[1\]:/.test(e))).toBe(true)
  })

  it('forwards a custom aggregate function to every event', () => {
    const max = (vals: number[]) => Math.max(...vals)
    const build = (members: typeof signers) => {
      const circle = createTrustCircle(members.map(m => m.pub), { scope: 'fed-1' })
      const contributions = members.map(m =>
        contributeAssertion(circle, subject, { rank: 80 }, m.priv, circle.members.indexOf(m.pub)),
      )
      return aggregateContributions(circle, subject, contributions, max)
    }
    const a = build([signers[0], signers[1]])
    const b = build([signers[0], signers[2]])
    expect(verifyFederation([a, b]).valid).toBe(false) // veil-agg: custom, no function supplied
    expect(verifyFederation([a, b], max).valid).toBe(true) // function forwarded to each verifyProof
  })
})
