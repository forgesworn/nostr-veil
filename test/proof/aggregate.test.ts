import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions } from '../../src/proof/aggregate.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

describe('aggregateContributions', () => {
  const privKeys = [
    '0101010101010101010101010101010101010101010101010101010101010101',
    '0202020202020202020202020202020202020202020202020202020202020202',
    '0303030303030303030303030303030303030303030303030303030303030303',
  ]
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(k)))
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
})
