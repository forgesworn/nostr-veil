import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion, contributeEventAssertion } from '../../src/proof/contribute.js'
import {
  aggregateAddressableContributions,
  aggregateContributions,
  aggregateEventContributions,
  aggregateIdentifierContributions,
} from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'
import type { AggregateName } from '../../src/proof/types.js'

describe('aggregateContributions', () => {
  const privKeys = [
    '0101010101010101010101010101010101010101010101010101010101010101',
    '0202020202020202020202020202020202020202020202020202020202020202',
    '0303030303030303030303030303030303030303030303030303030303030303',
  ]
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
  const circle = createTrustCircle(pubKeys)
  const subject = 'dd'.repeat(32)

  function makeContributions(ranks: number[]) {
    return ranks.map((rank, i) => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, subject, { rank }, privKeys[i], memberIndex)
    })
  }

  it('produces a kind 30382 event', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    expect(event.kind).toBe(NIP85_KINDS.USER)
  })

  it('includes d-tag with subject', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    expect(event.tags).toContainEqual(['d', subject])
  })

  it('computes median for numeric metrics', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    const rankTag = event.tags.find(t => t[0] === 'rank')
    expect(rankTag?.[1]).toBe('85')
  })

  it('includes veil-ring tag with all member pubkeys', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    const ringTag = event.tags.find(t => t[0] === 'veil-ring')
    expect(ringTag).toBeDefined()
    expect(ringTag!.slice(1)).toEqual(circle.members)
  })

  it('includes veil-threshold tag', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    const thresholdTag = event.tags.find(t => t[0] === 'veil-threshold')
    expect(thresholdTag).toEqual(['veil-threshold', '3', '3'])
  })

  it('includes one veil-sig tag per contribution', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    const sigTags = event.tags.filter(t => t[0] === 'veil-sig')
    expect(sigTags).toHaveLength(3)
  })

  it('rejects contributions with duplicate key images', () => {
    const contributions = makeContributions([80, 85, 90])
    contributions[1] = contributions[0] // same signer
    expect(() => aggregateContributions(circle, subject, contributions)).toThrow(/duplicate/i)
  })

  it('rejects contributions with invalid signatures', () => {
    const contributions = makeContributions([80, 85, 90])
    contributions[0] = { ...contributions[0], signature: { ...contributions[0].signature, c0: 'ff'.repeat(32) } }
    expect(() => aggregateContributions(circle, subject, contributions)).toThrow(/invalid/i)
  })

  it('rejects contributions whose metrics differ from the signed message', () => {
    const contributions = makeContributions([80, 85, 90])
    contributions[0].metrics.rank = 100
    expect(() => aggregateContributions(circle, subject, contributions)).toThrow(/signed message/i)
  })

  it('rejects contributions whose detached key image differs from the signature', () => {
    const contributions = makeContributions([80, 85, 90])
    contributions[0] = { ...contributions[0], keyImage: contributions[1].keyImage }
    expect(() => aggregateContributions(circle, subject, contributions)).toThrow(/key image/i)
  })

  it('handles even number of contributions for median', () => {
    const twoContributions = [0, 1].map(i => {
      const memberIndex = circle.members.indexOf(pubKeys[i])
      return contributeAssertion(circle, subject, { rank: 80 + i * 10 }, privKeys[i], memberIndex)
    })
    const event = aggregateContributions(circle, subject, twoContributions)
    const rankTag = event.tags.find(t => t[0] === 'rank')
    expect(rankTag?.[1]).toBe('85') // median of [80, 90]
  })

  it('handles heterogeneous metrics across contributions', () => {
    const c0 = contributeAssertion(circle, subject, { rank: 80, followers: 1200 }, privKeys[0], circle.members.indexOf(pubKeys[0]))
    const c1 = contributeAssertion(circle, subject, { rank: 85 }, privKeys[1], circle.members.indexOf(pubKeys[1]))
    const c2 = contributeAssertion(circle, subject, { rank: 90 }, privKeys[2], circle.members.indexOf(pubKeys[2]))
    const event = aggregateContributions(circle, subject, [c0, c1, c2])
    const rankTag = event.tags.find(t => t[0] === 'rank')
    const followersTag = event.tags.find(t => t[0] === 'followers')
    expect(rankTag?.[1]).toBe('85')
    expect(followersTag?.[1]).toBe('1200')
  })

  it('accepts custom aggregate function', () => {
    const mean = (vals: number[]) => Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]), mean)
    const rankTag = event.tags.find(t => t[0] === 'rank')
    expect(rankTag?.[1]).toBe('85')
  })

  it('veil-sig tags contain no private key material', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    const sigTags = event.tags.filter(t => t[0] === 'veil-sig')
    for (const tag of sigTags) {
      const serialised = tag[1]
      const parsed = JSON.parse(serialised)
      // Must not contain ring (stored separately) or any private key
      expect(parsed.ring).toBeUndefined()
      expect(parsed.keyImage).toBeUndefined()
      // Must contain only the expected public fields
      const allowedKeys = new Set(['c0', 'electionId', 'message', 'responses', 'domain'])
      for (const key of Object.keys(parsed)) {
        expect(allowedKeys.has(key)).toBe(true)
      }
      // Verify no private key hex strings appear (32-byte hex = 64 chars)
      for (const pk of privKeys) {
        expect(serialised).not.toContain(pk)
      }
    }
  })

  it('veil-sig serialisation has deterministic key ordering', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    const sigTags = event.tags.filter(t => t[0] === 'veil-sig')
    for (const tag of sigTags) {
      const parsed = JSON.parse(tag[1])
      const keys = Object.keys(parsed)
      const sortedKeys = [...keys].sort()
      expect(keys).toEqual(sortedKeys)
    }
  })

  it('tags the aggregate function as median by default', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    expect(event.tags).toContainEqual(['veil-agg', 'median'])
  })

  it('records a named aggregate function in the veil-agg tag', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 84, 92]), { aggregate: 'mean' })
    expect(event.tags).toContainEqual(['veil-agg', 'mean'])
    expect(event.tags.find(t => t[0] === 'rank')?.[1]).toBe('85') // mean of 80, 84, 92
  })

  it('tags a bare custom aggregate function as custom', () => {
    const max = (vals: number[]) => Math.max(...vals)
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]), max)
    expect(event.tags).toContainEqual(['veil-agg', 'custom'])
  })

  it('throws on an unknown aggregate name', () => {
    expect(() => aggregateContributions(
      circle, subject, makeContributions([80, 85, 90]),
      { aggregate: 'mode' as AggregateName },
    )).toThrow(/unknown aggregate/i)
  })

  it('omits the veil-scope tag for an unscoped circle', () => {
    const event = aggregateContributions(circle, subject, makeContributions([80, 85, 90]))
    expect(event.tags.find(t => t[0] === 'veil-scope')).toBeUndefined()
  })

  it('records the federation scope in a veil-scope tag', () => {
    const scoped = createTrustCircle(pubKeys, { scope: 'fed-1' })
    const contributions = pubKeys.map((pk, i) =>
      contributeAssertion(scoped, subject, { rank: 80 + i * 5 }, privKeys[i], scoped.members.indexOf(pk)),
    )
    const event = aggregateContributions(scoped, subject, contributions)
    expect(event.tags).toContainEqual(['veil-scope', 'fed-1'])
  })

  it('exposes a matching veil-sig key image for a shared signer across scoped circles', () => {
    const signers = privKeys.map((priv, i) => ({ priv, pub: pubKeys[i] }))
    const aggregateScoped = (members: typeof signers, scope: string) => {
      const c = createTrustCircle(members.map(s => s.pub), { scope })
      const contributions = members.map(s =>
        contributeAssertion(c, subject, { rank: 80 }, s.priv, c.members.indexOf(s.pub)),
      )
      return aggregateContributions(c, subject, contributions)
    }
    const eventA = aggregateScoped([signers[0], signers[1]], 'fed-1')
    const eventB = aggregateScoped([signers[0], signers[2]], 'fed-1')
    const keyImagesA = eventA.tags.filter(t => t[0] === 'veil-sig').map(t => t[2])
    const keyImagesB = eventB.tags.filter(t => t[0] === 'veil-sig').map(t => t[2])
    expect(keyImagesA.filter(ki => keyImagesB.includes(ki))).toHaveLength(1)
  })

  it('rejects contributions whose scope does not match the aggregating circle', () => {
    const fedCircle = createTrustCircle(pubKeys, { scope: 'fed-1' })
    const contributions = pubKeys.map((pk, i) =>
      contributeAssertion(fedCircle, subject, { rank: 80 }, privKeys[i], fedCircle.members.indexOf(pk)),
    )
    // Same members, different scope -- the signed electionId no longer matches
    const otherCircle = createTrustCircle(pubKeys, { scope: 'fed-2' })
    expect(() => aggregateContributions(otherCircle, subject, contributions)).toThrow(/electionId/i)
  })

  it('aggregates event assertions with a matching e-tag and no user p-tag', () => {
    const eventId = 'e1'.repeat(32)
    const contributions = privKeys.map((pk, i) =>
      contributeAssertion(circle, eventId, { rank: 70 + i * 10 }, pk, circle.members.indexOf(pubKeys[i])),
    )
    const event = aggregateEventContributions(circle, eventId, contributions)
    expect(event.kind).toBe(NIP85_KINDS.EVENT)
    expect(event.tags).toContainEqual(['d', eventId])
    expect(event.tags).toContainEqual(['e', eventId])
    expect(event.tags.find(t => t[0] === 'p')).toBeUndefined()
    expect(verifyProof(event).valid).toBe(true)
  })

  it('aggregates addressable assertions with a matching a-tag', () => {
    const address = `30023:${subject}:article`
    const contributions = privKeys.map((pk, i) =>
      contributeAssertion(circle, address, { rank: 80 + i * 5 }, pk, circle.members.indexOf(pubKeys[i])),
    )
    const event = aggregateAddressableContributions(circle, address, contributions)
    expect(event.kind).toBe(NIP85_KINDS.ADDRESSABLE)
    expect(event.tags).toContainEqual(['d', address])
    expect(event.tags).toContainEqual(['a', address])
    expect(event.tags.find(t => t[0] === 'p')).toBeUndefined()
    expect(verifyProof(event).valid).toBe(true)
  })

  it('aggregates identifier assertions with a k-tag', () => {
    const identifier = 'relay:wss://relay.example.com'
    const contributions = privKeys.map((pk, i) =>
      contributeAssertion(circle, identifier, { rank: 80 + i * 5 }, pk, circle.members.indexOf(pubKeys[i])),
    )
    const event = aggregateIdentifierContributions(circle, identifier, '10002', contributions)
    expect(event.kind).toBe(NIP85_KINDS.IDENTIFIER)
    expect(event.tags).toContainEqual(['d', identifier])
    expect(event.tags).toContainEqual(['k', '10002'])
    expect(event.tags.find(t => t[0] === 'p')).toBeUndefined()
    expect(verifyProof(event).valid).toBe(true)
  })

  it('aggregates v2 event assertions with a version marker and verifies them', () => {
    const eventId = 'e1'.repeat(32)
    const contributions = privKeys.map((pk, i) =>
      contributeEventAssertion(
        circle,
        eventId,
        { rank: 70 + i * 10 },
        pk,
        circle.members.indexOf(pubKeys[i]),
        { proofVersion: 'v2' },
      ),
    )
    const event = aggregateEventContributions(circle, eventId, contributions, { proofVersion: 'v2' })
    expect(event.kind).toBe(NIP85_KINDS.EVENT)
    expect(event.tags).toContainEqual(['veil-version', '2'])
    expect(event.tags).toContainEqual(['e', eventId])
    expect(verifyProof(event).valid).toBe(true)
    expect(verifyProof(event, { requireProofVersion: 'v2' }).valid).toBe(true)
  })
})
