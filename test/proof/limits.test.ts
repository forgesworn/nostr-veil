import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion, contributeIdentifierAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions, aggregateIdentifierContributions } from '../../src/proof/aggregate.js'
import { DEFAULT_VERIFY_LIMITS, verifyProof } from '../../src/proof/verify.js'

const keys = ['11', '22', '33'].map(byte => byte.repeat(32))
const members = keys.map(key => bytesToHex(schnorr.getPublicKey(hexToBytes(key))))
const circle = createTrustCircle(members)
const subject = 'dd'.repeat(32)
const contributions = keys.map((key, i) =>
  contributeAssertion(circle, subject, { rank: 80 + i }, key, circle.members.indexOf(members[i]), { proofVersion: 'v2' }))
const sound = aggregateContributions(circle, subject, contributions, { proofVersion: 'v2' })
const withTags = (count: number) => ({ ...sound, tags: [...sound.tags, ...Array.from({ length: count - sound.tags.length }, () => ['t', 'x'])] })

describe('the number of tags', () => {
  it('turns away an event with more tags than the limit, before reading them', () => {
    const proof = verifyProof(withTags(1_201))

    expect(proof.valid).toBe(false)
    expect(proof.errors).toEqual(['Event has 1201 tags, more than the limit of 1200'])
  })

  it('reads an event with as many tags as the limit allows', () => {
    expect(verifyProof(withTags(1_200)).errors.some(error => error.includes('more than the limit'))).toBe(false)
  })

  it('takes its limit from the ring and metric limits unless one is given', () => {
    // A ring of 2,000 and 128 metrics leave room for 2,200 tags
    expect(verifyProof(withTags(2_200), { limits: { maxRingSize: 2_000 } }).errors.some(error => error.includes('more than the limit'))).toBe(false)
    expect(verifyProof(withTags(2_201), { limits: { maxRingSize: 2_000 } }).errors).toEqual(['Event has 2201 tags, more than the limit of 2200'])
    expect(verifyProof(withTags(51), { limits: { maxRingSize: 2_000, maxTagCount: 50 } }).errors).toEqual(['Event has 51 tags, more than the limit of 50'])
  })

  it('is not in the exported defaults, so a copy of them keeps following the ring limit', () => {
    expect('maxTagCount' in DEFAULT_VERIFY_LIMITS).toBe(false)
    expect(verifyProof(withTags(2_200), { limits: { ...DEFAULT_VERIFY_LIMITS, maxRingSize: 2_000 } }).errors.some(error => error.includes('more than the limit'))).toBe(false)
  })
})

describe('the length of a tag name', () => {
  it('turns away a tag name longer than any a sound event carries, without quoting it', () => {
    const proof = verifyProof({ ...sound, tags: [...sound.tags, ['n'.repeat(65), '1']] })

    expect(proof.valid).toBe(false)
    expect(proof.errors).toEqual(['Event has a tag name longer than 64 characters'])
  })

  // Tags whose names begin veil- and which no proof uses are passed over, and
  // no check quotes their names, so a long one costs nothing and changes no
  // decision: the event verifies as it did
  it('passes over a long name that begins veil-, which the proof does not read', () => {
    expect(verifyProof({ ...sound, tags: [...sound.tags, [`veil-${'n'.repeat(300)}`, 'padding']] }).valid).toBe(true)
    // Without the dash it names a metric, as any other name does
    expect(verifyProof({ ...sound, tags: [...sound.tags, [`veil${'n'.repeat(61)}`, '1']] }).errors).toEqual(['Event has a tag name longer than 64 characters'])
  })

  it('never turns away a fixed proof tag, whatever the metric name limit', () => {
    // expiration is the longest fixed name that does not begin veil-
    const expiring = { ...sound, tags: [...sound.tags, ['expiration', '1999999999']] }
    expect(verifyProof(expiring, { limits: { maxMetricNameLength: 4 } }).errors.some(error => error.includes('tag name longer'))).toBe(false)
  })
})

describe('the length of the subject', () => {
  // Its election id carries the subject, and ring-sig caps an election id at
  // 512 bytes, so no subject longer than that can be signed at all
  const withSubject = (value: string) => ({ ...sound, tags: sound.tags.map(tag => (tag[0] === 'd' ? ['d', value] : tag)) })
  const identifier = (value: string) => {
    const signed = keys.map((key, i) =>
      contributeIdentifierAssertion(circle, value, '0', { rank: 80 + i }, key, circle.members.indexOf(members[i]), { proofVersion: 'v2' }))
    return aggregateIdentifierContributions(circle, value, '0', signed, { proofVersion: 'v2' })
  }

  it('turns away a subject longer than the limit, without quoting it', () => {
    const proof = verifyProof(withSubject('a'.repeat(513)))

    expect(proof.valid).toBe(false)
    expect(proof.errors).toEqual(['Event has a d tag longer than 512 characters'])
  })

  it('verifies a signed subject as long as the limit allows, and takes a limit given in its place', () => {
    const event = identifier(`x:${'a'.repeat(398)}`)

    expect(verifyProof(event, { limits: { maxSubjectLength: 400 } }).valid).toBe(true)
    expect(verifyProof(event, { limits: { maxSubjectLength: 399 } }).errors).toEqual(['Event has a d tag longer than 399 characters'])
    expect(verifyProof(event).valid).toBe(true)
  })

  it('is longer by default than any subject the builders can sign', () => {
    expect(() => identifier(`x:${'a'.repeat(510)}`)).toThrow('electionId length exceeds maximum of 512 bytes')
    expect(DEFAULT_VERIFY_LIMITS.maxSubjectLength).toBe(512)
  })
})

describe('a limit that is not a limit', () => {
  it.each([
    ['maxTagCount', Number.NaN], ['maxTagCount', 'abc'], ['maxTagCount', -1], ['maxTagCount', null],
    ['maxSubjectLength', Number.NaN], ['maxSubjectLength', '600'], ['maxSubjectLength', -1], ['maxSubjectLength', Number.NEGATIVE_INFINITY],
    // null is not left out: it is a value, and not a limit
    ['maxSubjectLength', null], ['maxRingSize', null],
    ['maxRingSize', 'abc'], ['maxMetricCount', Number.NaN], ['maxMetricNameLength', '64'], ['maxSigPayloadBytes', {}], ['maxSignedMessageBytes', true],
  ] as const)('fails closed for %s of %s', (field, value) => {
    const proof = verifyProof(sound, { limits: { [field]: value } as never })

    expect(proof.valid).toBe(false)
    expect(proof.errors).toEqual([`limits.${field} must be a non-negative number`])
  })

  // As on 0.40.5, which compared each count against the number as it stood
  it('reads a fraction or a number past the safe integers as a limit', () => {
    expect(verifyProof(withTags(1_201), { limits: { maxTagCount: 1_200.5 } }).errors).toEqual(['Event has 1201 tags, more than the limit of 1200.5'])
    expect(verifyProof(sound, { limits: { maxRingSize: 2 ** 60 } }).valid).toBe(true)
    expect(verifyProof(sound, { limits: { maxRingSize: Number.MAX_VALUE, maxSubjectLength: Number.MAX_VALUE } }).valid).toBe(true)
  })

  it('takes the default for a limit left out or given as undefined, so it is never switched off', () => {
    expect(verifyProof(sound, { limits: { maxTagCount: undefined, maxSubjectLength: undefined } }).valid).toBe(true)
    expect(verifyProof({ ...sound, tags: [...sound.tags, ['n'.repeat(65), '1']] }, { limits: { maxMetricNameLength: undefined } }).errors)
      .toEqual(['Event has a tag name longer than 64 characters'])
    expect(verifyProof(withTags(1_201), { limits: { maxRingSize: undefined, maxMetricCount: undefined } }).errors)
      .toEqual(['Event has 1201 tags, more than the limit of 1200'])
  })

  it('reads limits that are not an object as none given', () => {
    expect(verifyProof(sound, { limits: null as never }).valid).toBe(true)
    expect(verifyProof(withTags(1_201), { limits: 'maxTagCount' as never }).errors).toEqual(['Event has 1201 tags, more than the limit of 1200'])
  })

  // The tag limit is worked out from these two when it is left out. A value
  // that cannot be added up fails closed like any other, and does not throw.
  it.each([
    ['maxRingSize', 1_000n], ['maxMetricCount', 128n], ['maxRingSize', Symbol('limit')],
    ['maxMetricCount', JSON.parse('{"toString":1}')], ['maxRingSize', new Number(1_000)],
  ] as const)('fails closed, without throwing, for %s of %s', (field, value) => {
    let proof: ReturnType<typeof verifyProof> | undefined
    expect(() => { proof = verifyProof(sound, { limits: { [field]: value } as never }) }).not.toThrow()
    expect(proof?.errors).toEqual([`limits.${field} must be a non-negative number`])
  })

  // As 0.40.5 read them, by spreading them over the defaults
  it('reads only the caller\'s own fields, of an object or a function', () => {
    const fromFunction = Object.assign(() => undefined, { maxRingSize: 2 })
    class Limits { get maxRingSize(): number { return 2 } }
    const inherited = Object.create({ maxRingSize: Number.NaN }) as object

    expect(verifyProof(sound, { limits: fromFunction as never }).valid).toBe(false)
    expect(verifyProof(sound, { limits: new Limits() as never }).valid).toBe(true)
    expect(verifyProof(sound, { limits: inherited as never }).valid).toBe(true)
  })

  it('reads no limit from Object.prototype', () => {
    const shared = Object.prototype as Record<string, unknown>
    shared.maxRingSize = Number.POSITIVE_INFINITY
    try {
      expect(verifyProof(withTags(1_201)).errors).toEqual(['Event has 1201 tags, more than the limit of 1200'])
    } finally {
      delete shared.maxRingSize
    }
  })

  it('lifts a limit given as Infinity', () => {
    expect(verifyProof(withTags(5_000), { limits: { maxTagCount: Number.POSITIVE_INFINITY } }).errors.some(error => error.includes('more than the limit'))).toBe(false)
    expect(verifyProof(withTags(5_000), { limits: { maxRingSize: Number.POSITIVE_INFINITY } }).errors.some(error => error.includes('more than the limit'))).toBe(false)
  })
})
