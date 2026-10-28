import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { lsagSign } from '@forgesworn/ring-sig'
import { createTrustCircle, canonicalMessage, electionId } from '../../src/proof/circle.js'
import { contributeAssertion, contributeIdentifierAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions, aggregateIdentifierContributions } from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'
import type { Contribution } from '../../src/proof/types.js'

// One circle member must not be able to turn a contribution metric into a tag
// that changes how relays or clients treat the whole aggregated event.

const privKeys = ['01', '02', '03'].map(b => b.repeat(32))
const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
const circle = createTrustCircle(pubKeys)
const subject = 'dd'.repeat(32)
const indexOf = (i: number) => circle.members.indexOf(pubKeys[i])

const RESERVED = [
  'expiration', '-', 'content-warning', 'alt', 'client', 'nonce', 'L', 'l', 'i',
  't', 'r', 'g', 'd', 'p', 'e', 'a', 'k', 'veil-anything', 'é',
]

function sortedJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, (_key, child: unknown) => {
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      return Object.fromEntries(Object.keys(child as object).sort().map(k => [k, (child as Record<string, unknown>)[k]]))
    }
    return child
  })
}

/** A v1 contribution signed over arbitrary metrics, bypassing the library's checks. */
function forgedContribution(metrics: Record<string, number>, signer: number): Contribution {
  const message = sortedJson({ circleId: circle.circleId, metrics, subject })
  const signature = lsagSign(message, circle.members, indexOf(signer), privKeys[signer], electionId(circle.circleId, subject))
  return { signature, keyImage: signature.keyImage, metrics: { ...metrics } }
}

function veilSigTag(c: Contribution): string[] {
  const { c0, domain, electionId: eid, message, responses } = c.signature
  const obj: Record<string, unknown> = { c0, electionId: eid, message, responses }
  if (domain !== undefined) obj.domain = domain
  return ['veil-sig', sortedJson(obj), c.keyImage]
}

describe('reserved metric names', () => {
  it.each(RESERVED)('contributeAssertion rejects the metric name %j', name => {
    expect(() => contributeAssertion(circle, subject, { rank: 50, [name]: 1 }, privKeys[0], indexOf(0))).toThrow(/reserved/)
  })

  it('rejects __proto__, which a plain object would silently drop', () => {
    const metrics = JSON.parse('{"rank":50,"__proto__":7}') as Record<string, number>
    expect(() => contributeAssertion(circle, subject, metrics, privKeys[0], indexOf(0))).toThrow(/reserved/)
  })

  it('canonicalMessage rejects a reserved metric name', () => {
    expect(() => canonicalMessage(circle.circleId, subject, { expiration: 1 })).toThrow(/reserved/)
  })

  it('contributeIdentifierAssertion with proof v2 rejects a reserved metric name', () => {
    expect(() =>
      contributeIdentifierAssertion(circle, 'https://a.example', 'web', { rank: 50, expiration: 1 }, privKeys[0], indexOf(0), { proofVersion: 'v2' }),
    ).toThrow(/reserved/)
  })

  it('still accepts ordinary metric names', () => {
    const metrics = { rank: 50, followers: 10, reports_cnt_recd: 0, zap_amt_sent: 21, customMetric: 1, 'my-metric': 2, tt: 3 }
    const contributions = privKeys.map((k, i) => contributeAssertion(circle, subject, metrics, k, indexOf(i)))
    expect(verifyProof(aggregateContributions(circle, subject, contributions)).valid).toBe(true)
  })

  it('aggregation rejects a hand-built contribution that carries a reserved metric, naming its index', () => {
    const contributions = [
      contributeAssertion(circle, subject, { rank: 50 }, privKeys[0], indexOf(0)),
      forgedContribution({ rank: 51, expiration: 1700000000 }, 1),
      contributeAssertion(circle, subject, { rank: 52 }, privKeys[2], indexOf(2)),
    ]
    expect(() => aggregateContributions(circle, subject, contributions)).toThrow(/index 1.*expiration|expiration.*index 1/)
  })

  it('aggregateIdentifierContributions rejects the injection too', () => {
    const forged = { ...forgedContribution({ rank: 51, '-': 1 }, 1) }
    expect(() => aggregateIdentifierContributions(circle, subject, 'web', [forged])).toThrow(/reserved/)
  })

  it.each(['expiration', '-', 'content-warning', 't'])(
    'verifyProof rejects an event whose signed contribution injects %j',
    name => {
      const honest = aggregateContributions(
        circle,
        subject,
        privKeys.map((k, i) => contributeAssertion(circle, subject, { rank: 50 }, k, indexOf(i))),
      )
      expect(verifyProof(honest).valid).toBe(true)

      // Member 1 alone signs an extra metric; median of one value is that value.
      const contributions = [
        contributeAssertion(circle, subject, { rank: 50 }, privKeys[0], indexOf(0)),
        forgedContribution({ rank: 50, [name]: 1700000000 }, 1),
        contributeAssertion(circle, subject, { rank: 50 }, privKeys[2], indexOf(2)),
      ]
      const tags = honest.tags.filter(t => t[0] !== 'veil-sig')
      const ringAt = tags.findIndex(t => t[0] === 'veil-ring')
      tags.splice(ringAt, 0, [name, '1700000000'])
      const forgedEvent = { ...honest, tags: [...tags, ...contributions.map(veilSigTag)] }

      const result = verifyProof(forgedEvent)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('reserved') && e.includes(name))).toBe(true)
    },
  )
})
