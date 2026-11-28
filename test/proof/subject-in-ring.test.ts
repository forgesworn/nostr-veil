import { describe, expect, it } from 'vitest'
import { lsagSign } from '@forgesworn/ring-sig'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { canonicalMessageV2, createTrustCircle, electionIdV2 } from '../../src/proof/circle.js'
import { contributeAssertion, contributeAssertionAsync } from '../../src/proof/contribute.js'
import type { LsagSigner } from '../../src/proof/contribute.js'
import { aggregateContributions } from '../../src/proof/aggregate.js'
import { verifyFederation } from '../../src/proof/federate.js'
import { verifyProof } from '../../src/proof/verify.js'
import type { Contribution, TrustCircle } from '../../src/proof/types.js'

// A pubkey is the same key in any case. Whether the subject is in the ring is
// a check that must find it however it is written: a check that misses it
// lets a member count their own signature about themselves.

const keys = ['11', '22', '33'].map(byte => byte.repeat(32))
const members = keys.map(key => bytesToHex(schnorr.getPublicKey(hexToBytes(key))))
const circle = createTrustCircle(members)
const index = (member: number) => circle.members.indexOf(members[member])
const spellings = [
  ['lower case', (key: string) => key],
  ['upper case', (key: string) => key.toUpperCase()],
  ['mixed case', (key: string) => key.slice(0, 32).toUpperCase() + key.slice(32)],
] as const

/** Contributions signed with ring-sig directly, as a client that skips the builder's guard signs them */
function signedDirectly(ring: TrustCircle, subject: string, signers: number[]): Contribution[] {
  const context = { kind: 30382, subjectTag: 'p' as const, subjectTagValue: subject }
  const scope = ring.scope ?? ring.circleId
  return signers.map((member) => {
    const metrics = { rank: 80 + member }
    const signature = lsagSign(
      canonicalMessageV2(ring.circleId, subject, metrics, context),
      ring.members,
      ring.members.indexOf(members[member]),
      keys[member],
      electionIdV2(scope, subject, context),
    )
    return { signature, keyImage: signature.keyImage, metrics }
  })
}

describe('a proof about a member of its ring', () => {
  it.each(spellings)('finds the subject in the ring when it is written in %s', (_name, spell) => {
    const subject = spell(members[0])
    const event = aggregateContributions(circle, subject, signedDirectly(circle, subject, [0, 1, 2]), { proofVersion: 'v2' })
    const proof = verifyProof(event)

    expect(proof.valid).toBe(true)
    expect(proof.subjectInRing).toBe(true)
    expect(proof.distinctSigners).toBe(3)
    expect(proof.independentSigners).toBe(2)
    expect(verifyProof(event, { rejectSubjectInRing: true }).errors).toContain('Subject is a veil-ring member')
  })

  it.each(spellings)('finds it in a federation when it is written in %s', (_name, spell) => {
    const scoped = createTrustCircle(members, { scope: 'subject-in-ring.example' })
    const subject = spell(members[0])
    const event = aggregateContributions(scoped, subject, signedDirectly(scoped, subject, [0, 1, 2]), { proofVersion: 'v2' })
    const federation = verifyFederation([event])

    expect(federation.valid).toBe(true)
    expect(federation.subjectInRing).toBe(true)
    expect(federation.independentSigners).toBe(2)
  })

  // A member key is 64 characters, so only a subject that long is lower-cased
  it('never lower-cases a subject that cannot be a member key', () => {
    const subject = members[0]
    const event = aggregateContributions(circle, subject, signedDirectly(circle, subject, [0, 1, 2]), { proofVersion: 'v2' })
    const long = { ...event, tags: event.tags.map(tag => (tag[0] === 'd' ? ['d', 'İ'.repeat(70)] : tag)) }
    const lowerCase = String.prototype.toLowerCase
    const lowered: number[] = []
    String.prototype.toLowerCase = function (this: string) { lowered.push(this.length); return lowerCase.call(this) }
    try {
      verifyProof(long, { limits: { maxSubjectLength: Number.POSITIVE_INFINITY } })
    } finally {
      String.prototype.toLowerCase = lowerCase
    }

    expect(lowered.filter(length => length !== 64)).toEqual([])
  })

  it('does not find a subject that is no member, in any case', () => {
    const outsider = bytesToHex(schnorr.getPublicKey(hexToBytes('44'.repeat(32))))
    for (const [, spell] of spellings) {
      const subject = spell(outsider)
      const proof = verifyProof(aggregateContributions(circle, subject, signedDirectly(circle, subject, [0, 1, 2]), { proofVersion: 'v2' }))
      expect(proof.subjectInRing).toBe(false)
      expect(proof.independentSigners).toBe(3)
    }
  })
})

describe('the builders, asked to sign about the member themselves', () => {
  const signer = (key: string): LsagSigner => ({
    lsagSign: request => lsagSign(request.message, request.ring, request.signerIndex, key, request.electionId),
  })

  it.each(spellings)('refuse a subject that is the member written in %s', async (_name, spell) => {
    const subject = spell(members[0])

    expect(() => contributeAssertion(circle, subject, { rank: 80 }, keys[0], index(0)))
      .toThrow('A circle member cannot contribute to an assertion about themselves')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, signer(keys[0]), index(0)))
      .rejects.toThrow('A circle member cannot contribute to an assertion about themselves')
  })

  it('still sign about another member, in any case', async () => {
    for (const [, spell] of spellings) {
      const subject = spell(members[1])
      expect(contributeAssertion(circle, subject, { rank: 80 }, keys[0], index(0)).keyImage).toMatch(/^[0-9a-f]{66}$/)
      expect((await contributeAssertionAsync(circle, subject, { rank: 80 }, signer(keys[0]), index(0))).keyImage).toMatch(/^[0-9a-f]{66}$/)
    }
  })

  // The external helper signs over its own copy of the ring, so the copy is
  // what it checks: a list that shows one member to the first read and the
  // subject to the copy is refused
  it('refuse, in the external helper, a subject the ring it signs over holds at the index', async () => {
    let reads = 0
    const shifting = new Proxy([...circle.members], {
      get(target, key, receiver) {
        if (key === String(index(0))) return reads++ === 0 ? members[1] : members[0]
        return Reflect.get(target, key, receiver)
      },
    })
    const asked: unknown[] = []
    const watching: LsagSigner = { lsagSign: (request) => { asked.push(request); return signer(keys[0]).lsagSign(request) } }

    await expect(contributeAssertionAsync({ ...circle, members: shifting }, members[0], { rank: 80 }, watching, index(0)))
      .rejects.toThrow('A circle member cannot contribute to an assertion about themselves')
    expect(asked).toHaveLength(0)
  })
})
