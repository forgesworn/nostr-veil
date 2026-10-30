import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion, contributeIdentifierAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions, aggregateIdentifierContributions } from '../../src/proof/aggregate.js'
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

  it('rejects a federation whose events are of different kinds', () => {
    // v1 proofs are not kind-bound, so each relabelled event still verifies alone
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = { ...scopedEvent([signers[0], signers[2]], 'fed-1'), kind: 30383 }
    const result = verifyFederation([a, b])
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Federation events are of different kinds')
  })

  it('forwards expectedKind to every event', () => {
    const a = scopedEvent([signers[0], signers[1]], 'fed-1')
    const b = scopedEvent([signers[0], signers[2]], 'fed-1')
    expect(verifyFederation([a, b], { expectedKind: 30382 }).valid).toBe(true)
    const wrong = verifyFederation([a, b], { expectedKind: 30383 })
    expect(wrong.valid).toBe(false)
    expect(wrong.errors[0]).toMatch(/^event\[0\]: Event kind 30382 does not match expected kind 30383/)
  })

  it('rejects v2 events bound to different k values, which give one signer two key images', () => {
    const identifierEvent = (members: typeof signers, kTag: string) => {
      const circle = createTrustCircle(members.map(m => m.pub), { scope: 'fed-1' })
      const contributions = members.map(m =>
        contributeIdentifierAssertion(circle, 'id-1', kTag, { rank: 80 }, m.priv, circle.members.indexOf(m.pub), { proofVersion: 'v2' }),
      )
      return aggregateIdentifierContributions(circle, 'id-1', kTag, contributions, { proofVersion: 'v2' })
    }
    const same = verifyFederation([identifierEvent([signers[0], signers[1]], 'isbn'), identifierEvent([signers[0], signers[2]], 'isbn')])
    expect(same.valid).toBe(true)
    expect(same.distinctSigners).toBe(3)

    const mixed = verifyFederation([identifierEvent([signers[0], signers[1]], 'isbn'), identifierEvent([signers[0], signers[2]], 'web')])
    expect(mixed.valid).toBe(false)
    expect(mixed.errors.some(e => e.includes('different election ids'))).toBe(true)
  })

  it('rejects a mix of v1 and v2 events', () => {
    const v2 = (members: typeof signers) => {
      const circle = createTrustCircle(members.map(m => m.pub), { scope: 'fed-1' })
      const contributions = members.map(m =>
        contributeAssertion(circle, subject, { rank: 80 }, m.priv, circle.members.indexOf(m.pub), { proofVersion: 'v2', kind: 30382, subjectTag: 'p', subjectTagValue: subject }),
      )
      return aggregateContributions(circle, subject, contributions, { proofVersion: 'v2' })
    }
    const result = verifyFederation([scopedEvent([signers[0], signers[1]], 'fed-1'), v2([signers[0], signers[2]])])
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('different election ids'))).toBe(true)
  })

  describe('subject inside a ring', () => {
    // signers[0] is the subject. It is a passive member of the first circle and never signs.
    const memberSubject = signers[0].pub
    const eventAbout = (members: typeof signers, signing: typeof signers) => {
      const circle = createTrustCircle(members.map(m => m.pub), { scope: 'fed-1' })
      const contributions = signing.map(m =>
        contributeAssertion(circle, memberSubject, { rank: 80 }, m.priv, circle.members.indexOf(m.pub)),
      )
      return aggregateContributions(circle, memberSubject, contributions)
    }
    const federation = () => [
      eventAbout([signers[0], signers[1], signers[2]], [signers[1], signers[2]]),
      eventAbout([signers[3], signers[4]], [signers[3], signers[4]]),
    ]

    it('reports the subject and one fewer independent signer', () => {
      const result = verifyFederation(federation())
      expect(result.valid).toBe(true)
      expect(result.distinctSigners).toBe(4)
      expect(result.subjectInRing).toBe(true)
      expect(result.independentSigners).toBe(3)
    })

    it('counts three distinct signers as two independent when the subject is in one ring', () => {
      const result = verifyFederation([
        eventAbout([signers[0], signers[1], signers[2]], [signers[1], signers[2]]),
        eventAbout([signers[1], signers[3]], [signers[3]]),
      ])
      expect(result.valid).toBe(true)
      expect(result.distinctSigners).toBe(3)
      expect(result.subjectInRing).toBe(true)
      expect(result.independentSigners).toBe(2)
    })

    it('is invalid under rejectSubjectInRing and still reports the subject', () => {
      const result = verifyFederation(federation(), { rejectSubjectInRing: true })
      expect(result.valid).toBe(false)
      expect(result.subjectInRing).toBe(true)
      expect(result.errors.some(e => e.includes('Subject is a veil-ring member'))).toBe(true)
    })

    it('reports no subject in a ring and every signer independent otherwise', () => {
      const result = verifyFederation([scopedEvent([signers[0], signers[1]], 'fed-1'), scopedEvent([signers[2], signers[3]], 'fed-1')])
      expect(result.subjectInRing).toBe(false)
      expect(result.independentSigners).toBe(result.distinctSigners)
    })

    it('reports a clean negative for an empty federation', () => {
      const result = verifyFederation([])
      expect(result.subjectInRing).toBe(false)
      expect(result.independentSigners).toBe(0)
    })
  })
})
