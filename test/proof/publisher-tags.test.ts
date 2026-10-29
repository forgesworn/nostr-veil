import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import {
  contributeAddressableAssertion,
  contributeAssertion,
  contributeEventAssertion,
  contributeIdentifierAssertion,
} from '../../src/proof/contribute.js'
import {
  aggregateAddressableContributions,
  aggregateContributions,
  aggregateEventContributions,
  aggregateIdentifierContributions,
} from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'
import { validateAssertionStrict } from '../../src/nip85/validators.js'
import { parseAssertion } from '../../src/nip85/parsers.js'
import type { EventTemplate } from '../../src/nip85/types.js'

// The publisher of a veil event may set a NIP-40 expiration and a NIP-31 alt.
// Neither is signed by the circle: the publisher's own Nostr signature covers
// them, as it already covers content. They must never be read as metrics.

const privKeys = ['01', '02', '03'].map(b => b.repeat(32))
const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
const circle = createTrustCircle(pubKeys)
const subject = 'dd'.repeat(32)
const indexOf = (i: number) => circle.members.indexOf(pubKeys[i])
const EXPIRY = 1_900_000_000

function userEvent(options: Record<string, unknown> = {}): EventTemplate {
  const contributions = privKeys.map((k, i) => contributeAssertion(circle, subject, { rank: 40 + i }, k, indexOf(i)))
  return aggregateContributions(circle, subject, contributions, options)
}

function withTags(event: EventTemplate, extra: string[][]): EventTemplate {
  const tags = event.tags.map(t => [...t])
  tags.splice(tags.findIndex(t => t[0] === 'veil-ring'), 0, ...extra)
  return { ...event, tags }
}

describe('publisher-set expiration and alt on veil events', () => {
  it('emits the same tag layout as 0.30.4 when the options are absent', () => {
    // LSAG signatures are randomised, so pin the tag names and non-signature values
    const layout = (event: EventTemplate) => event.tags.map(t => (t[0] === 'veil-sig' ? ['veil-sig'] : t))
    const expected = [
      ['d', subject],
      ['p', subject],
      ['rank', '41'],
      ['veil-ring', ...circle.members],
      ['veil-threshold', '3', '3'],
      ['veil-agg', 'median'],
      ['veil-sig'], ['veil-sig'], ['veil-sig'],
    ]
    expect(layout(userEvent())).toEqual(expected)
    expect(layout(userEvent({}))).toEqual(expected)
    expect(layout(userEvent({ aggregate: 'median' }))).toEqual(expected)
  })

  it('emits expiration and alt when supplied, and the proof verifies', () => {
    const event = userEvent({ expiration: EXPIRY, alt: 'Anonymous trust score' })
    expect(event.tags).toContainEqual(['expiration', String(EXPIRY)])
    expect(event.tags).toContainEqual(['alt', 'Anonymous trust score'])
    const result = verifyProof(event)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
    expect(validateAssertionStrict(event).valid).toBe(true)
  })

  it('places the publisher tags before the metric tags', () => {
    const event = userEvent({ expiration: EXPIRY })
    const names = event.tags.map(t => t[0])
    expect(names.indexOf('expiration')).toBeLessThan(names.indexOf('rank'))
    expect(names.indexOf('expiration')).toBeGreaterThan(names.indexOf('p'))
  })

  it('round-trips through every typed aggregator, v1 and v2', () => {
    const eventId = 'ee'.repeat(32)
    const address = `30023:${'aa'.repeat(32)}:post`
    const id = 'https://a.example'
    for (const proofVersion of ['v1', 'v2'] as const) {
      const opts = { proofVersion, expiration: EXPIRY, alt: 'score' }
      const cOpts = { proofVersion }
      const events = [
        aggregateEventContributions(circle, eventId,
          privKeys.map((k, i) => contributeEventAssertion(circle, eventId, { rank: 50 }, k, indexOf(i), cOpts)), opts),
        aggregateAddressableContributions(circle, address,
          privKeys.map((k, i) => contributeAddressableAssertion(circle, address, { rank: 50 }, k, indexOf(i), cOpts)), opts),
        aggregateIdentifierContributions(circle, id, 'web',
          privKeys.map((k, i) => contributeIdentifierAssertion(circle, id, 'web', { rank: 50 }, k, indexOf(i), cOpts)), opts),
      ]
      for (const event of events) {
        expect(event.tags).toContainEqual(['expiration', String(EXPIRY)])
        const result = verifyProof(event, { expectedKind: event.kind })
        expect(result.errors).toEqual([])
        expect(result.valid).toBe(true)
      }
    }
  })

  it('verifies a publisher tag added after aggregation', () => {
    const event = withTags(userEvent(), [['expiration', String(EXPIRY)], ['alt', 'score']])
    expect(verifyProof(event).valid).toBe(true)
  })

  it.each([
    [['expiration'], 'Invalid expiration tag'],
    [['expiration', 'soon'], 'Invalid expiration tag'],
    [['expiration', '1.5'], 'Invalid expiration tag'],
    [['expiration', '-1'], 'Invalid expiration tag'],
    [['expiration', '01900000000'], 'Invalid expiration tag'],
    [['expiration', ''], 'Invalid expiration tag'],
    [['expiration', '99999999999999999999'], 'Invalid expiration tag'],
    [['alt'], 'Invalid alt tag'],
    [['alt', ''], 'Invalid alt tag'],
  ])('rejects the malformed publisher tag %j', (tag, message) => {
    const result = verifyProof(withTags(userEvent(), [tag]))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes(message))).toBe(true)
    // the tag is checked as a publisher tag, never as an unsigned metric
    expect(result.errors.some(e => e.includes('not signed') || e.includes('missing a value'))).toBe(false)
  })

  it('verifies the publisher tags without reading them as unsigned metrics', () => {
    const result = verifyProof(withTags(userEvent(), [['expiration', String(EXPIRY)], ['alt', 'score']]))
    expect(result.errors).toEqual([])
  })

  it('parseAssertion leaves publisher tags out of a veil event\'s metrics', () => {
    const parsed = parseAssertion(userEvent({ expiration: EXPIRY, alt: 'Vouched for by 50 maintainers' }))
    expect(parsed.metrics).toEqual({ rank: '41' })
  })

  it('parseAssertion skips expiration on a plain NIP-85 event too', () => {
    const parsed = parseAssertion({ kind: 30382, tags: [['d', subject], ['rank', '5'], ['expiration', '7']], content: '' })
    expect(parsed.metrics).toEqual({ rank: '5' })
  })

  it('rejects a non-string expiration value', () => {
    const event = withTags(userEvent(), [['expiration', EXPIRY as unknown as string]])
    expect(verifyProof(event).valid).toBe(false)
  })

  it.each(['expiration', 'alt'])('rejects a duplicated %s tag', name => {
    const value = name === 'expiration' ? String(EXPIRY) : 'x'
    const result = verifyProof(withTags(userEvent(), [[name, value], [name, value]]))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes(`Multiple ${name} tags`))).toBe(true)
  })

  it.each(['client', 'nonce', '-', 'content-warning', 'L', 'l', 'i'])(
    'still rejects the unsigned general tag %j on a veil event',
    name => {
      const result = verifyProof(withTags(userEvent(), [[name, '1']]))
      expect(result.valid).toBe(false)
    },
  )

  it('does not check expiry against the clock', () => {
    const event = userEvent({ expiration: 1 })
    expect(verifyProof(event).valid).toBe(true)
  })

  it.each([
    [{ expiration: -1 }],
    [{ expiration: 1.5 }],
    [{ expiration: Number.MAX_SAFE_INTEGER + 1 }],
    [{ expiration: Number.NaN }],
    [{ expiration: '1900000000' }],
    [{ alt: '' }],
    [{ alt: 7 }],
  ])('aggregation rejects the option %j', options => {
    expect(() => userEvent(options)).toThrow(/expiration|alt/)
  })

  it('accepts expiration alongside a named aggregate', () => {
    const event = userEvent({ aggregate: 'mean', expiration: EXPIRY })
    expect(event.tags).toContainEqual(['veil-agg', 'mean'])
    expect(verifyProof(event).valid).toBe(true)
  })

  it('rejects a metric tag carrying elements the circle did not sign', () => {
    const event = userEvent()
    const tags = event.tags.map(t => (t[0] === 'rank' ? [...t, 'unsigned extra'] : t))
    const result = verifyProof({ ...event, tags })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Metric "rank" has extra elements the circle did not sign')
  })

  it('rejects a k tag on any kind but 30385', () => {
    const result = verifyProof(withTags(userEvent(), [['k', 'isbn']]))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('k tag is only allowed on kind 30385')
  })

  it('rejects a d tag carrying elements the circle did not sign', () => {
    const event = userEvent()
    const tags = event.tags.map(t => (t[0] === 'd' ? [...t, 'unsigned extra'] : t))
    const result = verifyProof({ ...event, tags })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('d tag has extra elements the circle did not sign')
  })

  it('rejects a k tag carrying elements the circle did not sign, on kind 30385', () => {
    const contributions = privKeys.map((k, i) => contributeIdentifierAssertion(circle, 'id-1', 'isbn', { rank: 40 + i }, k, indexOf(i), { proofVersion: 'v2' }))
    const event = aggregateIdentifierContributions(circle, 'id-1', 'isbn', contributions, { proofVersion: 'v2' })
    expect(verifyProof(event).valid).toBe(true)
    const tags = event.tags.map(t => (t[0] === 'k' ? [...t, 'unsigned extra'] : t))
    const result = verifyProof({ ...event, tags })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('k tag has extra elements the circle did not sign')
  })

  it.each(['veil-ring', 'veil-threshold'])('rejects a second %s tag', name => {
    const event = userEvent()
    const original = event.tags.find(t => t[0] === name)!
    const result = verifyProof({ ...event, tags: [...event.tags, [...original]] })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(`Multiple ${name} tags`)
  })

  it.each(['veil-threshold', 'veil-agg', 'veil-sig'])('rejects extra elements on %s', name => {
    const event = userEvent()
    const tags = event.tags.map(t => (t[0] === name ? [...t, 'extra'] : t))
    const result = verifyProof({ ...event, tags })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(`${name} tag has extra elements`)
  })

  it('rejects extra elements on veil-version and veil-scope', () => {
    const circleScoped = createTrustCircle(pubKeys, { scope: 'fed-1' })
    const contributions = privKeys.map((k, i) => contributeAssertion(circleScoped, subject, { rank: 40 + i }, k, circleScoped.members.indexOf(pubKeys[i]), { proofVersion: 'v2', kind: 30382, subjectTag: 'p', subjectTagValue: subject }))
    const event = aggregateContributions(circleScoped, subject, contributions, { proofVersion: 'v2' })
    expect(verifyProof(event).valid).toBe(true)
    for (const name of ['veil-version', 'veil-scope']) {
      const tags = event.tags.map(t => (t[0] === name ? [...t, 'extra'] : t))
      const result = verifyProof({ ...event, tags })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(`${name} tag has extra elements`)
    }
  })

  it('still accepts an unknown veil- tag, so a newer tag does not break this verifier', () => {
    const result = verifyProof(withTags(userEvent(), [['veil-future', 'x', 'y']]))
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })
})
