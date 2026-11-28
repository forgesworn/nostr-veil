import { describe, expect, it } from 'vitest'
import { lsagSign } from '@forgesworn/ring-sig'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  canonicalMessageV2,
  classifyVerificationError,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  electionIdV2,
  signEvent,
  verifyProductionDeployment,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { Contribution, EventTemplate, TrustCircle, VerificationIssue } from '../../src/index.js'

// A ring signature hides which member signed, so when the subject is a member
// of the ring one of the signatures may be the subject's own. The profiles
// hold such a proof to their threshold without it.

const NOW = 1_778_000_000
const people = ['11', '22', '33', '44', '55', '66'].map((byte) => {
  const priv = byte.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})
const outsider = bytesToHex(schnorr.getPublicKey(hexToBytes('77'.repeat(32))))
const codes = (result: { issues?: VerificationIssue[] }): string[] => (result.issues ?? []).map(issue => issue.code)

/** One event, its contributions signed with ring-sig directly, as a client that skips the builder's guard signs them */
function assertion(ring: TrustCircle, subject: string, signers: number[], metrics: Record<string, number>): EventTemplate {
  const context = { kind: 30382, subjectTag: 'p' as const, subjectTagValue: subject }
  const contributions: Contribution[] = signers.map((person) => {
    const signature = lsagSign(
      canonicalMessageV2(ring.circleId, subject, metrics, context),
      ring.members,
      ring.members.indexOf(people[person].pub),
      people[person].priv,
      electionIdV2(ring.scope ?? ring.circleId, subject, context),
    )
    return { signature, keyImage: signature.keyImage, metrics: { ...metrics } }
  })
  return { ...aggregateContributions(ring, subject, contributions, { proofVersion: 'v2' }), created_at: NOW }
}

describe('a profile threshold for a proof about a member of its ring', () => {
  const circle = createTrustCircle(people.slice(0, 3).map(person => person.pub))
  const gate = { acceptedCircleIds: [circle.circleId], now: NOW }
  const aboutMember = assertion(circle, people[0].pub, [0, 1, 2], { rank: 80 })
  const aboutOutsider = assertion(circle, outsider, [0, 1, 2], { rank: 80 })
  const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE

  it('sets one signature aside for the subject, so three signatures do not meet three', () => {
    const result = verifyUseCaseProfile(aboutMember, profile, { ...gate, minDistinctSigners: 3 })

    expect(result.valid).toBe(false)
    expect(codes(result)).toEqual(['proof.threshold_not_met'])
    const issue = (result.issues ?? [])[0]
    expect(issue.message).toBe('event[0] has fewer than 3 distinct signers once one is set aside, as the subject is a ring member and may have signed')
    expect(classifyVerificationError(issue.message).code).toBe('proof.threshold_not_met')
  })

  it('accepts the same proof where the other signatures meet the threshold', () => {
    expect(verifyUseCaseProfile(aboutMember, profile, { ...gate, minDistinctSigners: 2 }).valid).toBe(true)
  })

  it('counts every signature for a subject that is no member', () => {
    expect(verifyUseCaseProfile(aboutOutsider, profile, { ...gate, minDistinctSigners: 3 }).valid).toBe(true)
    expect(verifyUseCaseProfile(assertion(circle, outsider, [0, 1], { rank: 80 }), profile, { ...gate, minDistinctSigners: 3 }).issues?.[0]?.message)
      .toBe('event[0] has fewer than 3 distinct signers')
  })

  // Only a proof that verifies has a signature set aside. One that does not
  // is counted as before, and gains no threshold code.
  it('counts a proof that fails for another reason as before', () => {
    const tampered = { ...aboutMember, tags: aboutMember.tags.map(tag => (tag[0] === 'veil-agg' ? ['veil-agg', 'max'] : tag)) }
    const result = verifyUseCaseProfile(tampered, profile, { ...gate, minDistinctSigners: 3 })

    expect(codes(result)).toEqual(['proof.aggregate_mismatch'])
  })

  it('fails the proof and threshold control of the production report', () => {
    const policy = createDeploymentPolicy(profile, {
      acceptedCircleIds: [circle.circleId],
      expectedSubject: people[0].pub,
      minDistinctSigners: 3,
      requireNostrSignature: true,
    })
    const bundle = createSignedDeploymentBundle(policy, { expiresAt: NOW + 600, id: 'subject-in-ring', issuedAt: NOW - 10, privateKey: '99'.repeat(32) })
    const production = verifyProductionDeployment(signEvent(aboutMember, '88'.repeat(32)), bundle, { now: NOW, trustedPublishers: [bundle.signer] })
    const controls = Object.fromEntries(createProductionDecisionReport(production).controls.map(control => [control.id, control.status]))

    expect(production.decision).toBe('reject')
    expect(controls['proof-threshold']).toBe('fail')
  })
})

describe('a federation threshold where the subject is a member of one ring', () => {
  const scope = 'subject-in-ring.federation.example'
  const circleA = createTrustCircle(people.slice(0, 3).map(person => person.pub), { scope })
  const circleB = createTrustCircle(people.slice(3, 6).map(person => person.pub), { scope })
  const gate = { acceptedCircleIds: [circleA.circleId, circleB.circleId], now: NOW }
  const metrics = { rank: 30, reports_cnt_recd: 1 }

  it('sets one signature aside for the subject, so four signatures do not meet four', () => {
    // Two in each ring, the subject among those in the first
    const events = [assertion(circleA, people[0].pub, [0, 1], metrics), assertion(circleB, people[0].pub, [3, 4], metrics)]
    const result = verifyUseCaseProfile(events, FEDERATED_MODERATION_PROFILE, gate)

    expect(result.valid).toBe(false)
    expect(codes(result)).toEqual(['federation.threshold_not_met'])
    expect(result.federation?.independentSigners).toBe(3)
    const message = (result.issues ?? [])[0].message
    expect(message).toBe('federation has fewer than 4 distinct signers once one is set aside, as the subject is a ring member and may have signed')
    expect(classifyVerificationError(message).code).toBe('federation.threshold_not_met')
  })

  it('counts every signature for a subject in neither ring', () => {
    const events = [assertion(circleA, outsider, [0, 1], metrics), assertion(circleB, outsider, [3, 4], metrics)]
    const short = [assertion(circleA, outsider, [0, 1], metrics), assertion(circleB, outsider, [3], metrics)]

    expect(verifyUseCaseProfile(events, FEDERATED_MODERATION_PROFILE, gate).valid).toBe(true)
    expect((verifyUseCaseProfile(short, FEDERATED_MODERATION_PROFILE, gate).issues ?? []).map(issue => issue.message))
      .toEqual(['federation has fewer than 4 distinct signers'])
  })
})

// A federation is held to its number of distinct rings, not its number of events
describe('the circles a federation counts', () => {
  const scope = 'federation-circles.example'
  const circleA = createTrustCircle(people.slice(0, 3).map(person => person.pub), { scope })
  const circleB = createTrustCircle(people.slice(3, 6).map(person => person.pub), { scope })
  const gate = { acceptedCircleIds: [circleA.circleId, circleB.circleId], now: NOW, minDistinctSigners: 3 }
  const metrics = { rank: 30, reports_cnt_recd: 1 }
  const fromA = assertion(circleA, outsider, [0, 1, 2], metrics)
  const fromB = assertion(circleB, outsider, [3, 4, 5], metrics)
  const tooFew = 'profile federation requires at least 2 circles'

  it('accepts events from two circles', () => {
    expect(verifyUseCaseProfile([fromA, fromB], FEDERATED_MODERATION_PROFILE, gate).valid).toBe(true)
  })

  it('reports one event once, as too few events', () => {
    const result = verifyUseCaseProfile([fromA], FEDERATED_MODERATION_PROFILE, gate)

    expect((result.issues ?? []).map(issue => [issue.code, issue.message])).toEqual([['federation.invalid', tooFew]])
  })

  it.each([
    ['the same event', [fromA, fromA]],
    ['equal events', [fromA, JSON.parse(JSON.stringify(fromA)) as EventTemplate]],
    ['two events of one ring', [fromA, assertion(circleA, outsider, [0, 1], { rank: 40, reports_cnt_recd: 2 })]],
  ])('counts distinct rings, not events: %s', (_name, events) => {
    const result = verifyUseCaseProfile(events as EventTemplate[], FEDERATED_MODERATION_PROFILE, gate)

    expect(result.valid).toBe(false)
    expect(result.federation?.circleCount).toBe(1)
    expect((result.issues ?? []).map(issue => [issue.code, issue.message])).toContainEqual(['federation.invalid', tooFew])
  })
})

describe('a federation that fails already', () => {
  const scope = 'federation-failing.example'
  const circleA = createTrustCircle(people.slice(0, 3).map(person => person.pub), { scope })
  const circleB = createTrustCircle(people.slice(3, 6).map(person => person.pub), { scope })
  const gate = { acceptedCircleIds: [circleA.circleId, circleB.circleId], now: NOW, minDistinctSigners: 3 }
  const metrics = { rank: 30, reports_cnt_recd: 1 }

  // The subject is in the ring of the event that fails, whose signatures are
  // not counted: with its signatures gone, the federation check fails too
  it('is counted as before, and gains neither the threshold nor the circle count', () => {
    const failing = assertion(circleA, people[0].pub, [0, 1], metrics)
    const unsigned = { ...failing, tags: failing.tags.filter(tag => tag[0] !== 'veil-sig') }
    const result = verifyUseCaseProfile([unsigned, assertion(circleB, people[0].pub, [3, 4, 5], metrics)], FEDERATED_MODERATION_PROFILE, gate)

    expect(result.valid).toBe(false)
    expect(result.federation?.valid).toBe(false)
    expect(result.federation?.subjectInRing).toBe(true)
    expect(codes(result)).not.toContain('federation.threshold_not_met')
    expect((result.issues ?? []).map(issue => issue.message)).not.toContain('profile federation requires at least 2 circles')
  })

  // Each event passes on its own, but under two scopes the federation check
  // fails, so nothing is set aside
  it('is counted as before where each event passes but the federation does not', () => {
    const otherScope = createTrustCircle(people.slice(3, 6).map(person => person.pub), { scope: 'federation-failing-2.example' })
    const events = [assertion(circleA, people[0].pub, [0, 1], metrics), assertion(otherScope, people[0].pub, [3, 4], metrics)]
    const result = verifyUseCaseProfile(events, FEDERATED_MODERATION_PROFILE, { ...gate, acceptedCircleIds: [circleA.circleId, otherScope.circleId], minDistinctSigners: 4 })

    expect(result.events.every(item => item.proof.valid)).toBe(true)
    expect(result.federation?.valid).toBe(false)
    expect(result.federation?.subjectInRing).toBe(true)
    expect(result.federation?.circleCount).toBe(2)
    expect(codes(result)).not.toContain('federation.threshold_not_met')
  })
})

// The federation check verifies each proof without the profile's pins, so a
// federation can pass it while the profile turns its events away. It is then
// counted as before, as is one with too few events or circles.
describe('a federation the profile turns away for another reason', () => {
  const scope = 'federation-profile-fails.example'
  const circleA = createTrustCircle(people.slice(0, 3).map(person => person.pub), { scope })
  const circleB = createTrustCircle(people.slice(3, 6).map(person => person.pub), { scope })
  const gate = { acceptedCircleIds: [circleA.circleId, circleB.circleId], now: NOW }
  const metrics = { rank: 30, reports_cnt_recd: 1 }
  // Two in each ring, the subject among those in the first: four signers, three once one is set aside
  const fromA = assertion(circleA, people[0].pub, [0, 1], metrics)
  const fromB = assertion(circleB, people[0].pub, [3, 4], metrics)
  const asMax = (event: EventTemplate): EventTemplate => ({ ...event, tags: event.tags.map(tag => (tag[0] === 'veil-agg' ? ['veil-agg', 'max'] : tag)) })
  // One circle's event with four signers, the subject among them: four meet the threshold of four only uncounted
  const circleBig = createTrustCircle(people.slice(0, 5).map(person => person.pub), { scope })
  const fromBig = assertion(circleBig, people[0].pub, [0, 1, 2, 3], metrics)

  it.each([
    ['events republished under another aggregate', [asMax(fromA), asMax(fromB)]],
    ['one event', [fromBig]],
    ['the same event', [fromBig, fromBig]],
  ])('does not gain the threshold for %s', (_name, events) => {
    const result = verifyUseCaseProfile(events as EventTemplate[], FEDERATED_MODERATION_PROFILE, { ...gate, acceptedCircleIds: [...gate.acceptedCircleIds, circleBig.circleId] })

    expect(result.valid).toBe(false)
    expect(codes(result)).not.toContain('federation.threshold_not_met')
  })
})
