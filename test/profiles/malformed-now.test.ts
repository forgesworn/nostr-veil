import { describe, expect, it } from 'vitest'
import {
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  classifyVerificationError,
  contributeAssertion,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createCircleManifest,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  explainVerificationIssue,
  resolveCircleManifests,
  signEvent,
  verifyAdmissionPresentation,
  verifyAdmissionRequest,
  verifyCircleManifest,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifySignedDeploymentBundle,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { CompanionEvidence, EventTemplate } from '../../src/index.js'

const NOW = 1_778_000_000
const TIME = 'now must be a Unix timestamp'
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const APPLICANT_KEY = '99'.repeat(32)
const audience = 'relay:wss://relay.example.com'

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}

const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const subject = pubkey(APPLICANT_KEY)
const contributions = [90, 85, 80].map((rank, index) => contributeAssertion(
  circle,
  subject,
  { rank },
  members[index].priv,
  circle.members.indexOf(members[index].pub),
  { proofVersion: 'v2' },
))
const proof = aggregateContributions(circle, subject, contributions)

/** The same proof, dated the given number of seconds from now. */
function dated(secondsFromNow: number): EventTemplate {
  return { ...proof, created_at: NOW + secondsFromNow }
}

const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject }

// Each of these ran out ten minutes before NOW
const staleAssertion = dated(-3600)
const expiredAssertion: EventTemplate = { ...dated(0), tags: [...proof.tags, ['expiration', String(NOW - 600)]] }
const expiredManifest = createCircleManifest({
  issuedAt: NOW - 3600,
  expiresAt: NOW - 600,
  members: [...circle.members],
  name: 'Reviewers',
  profileIds: [profile.id],
  purpose: 'Time tests',
})
const expiredBundle = createSignedDeploymentBundle(createDeploymentPolicy(profile, gate), {
  expiresAt: NOW - 600,
  id: 'expired',
  issuedAt: NOW - 3600,
  privateKey: OPERATOR_KEY,
})
const expiredChallenge = createAdmissionChallenge({
  applicantPubkey: subject,
  audience,
  expiresAt: NOW - 600,
  issuedAt: NOW - 3600,
  nonce: 'ab'.repeat(32),
})
const lateForChallenge = createAdmissionPresentation(expiredChallenge, APPLICANT_KEY, { createdAt: NOW - 3000 })
const evidencePolicy = createDeploymentPolicy(profile, { ...gate, companionEvidence: [{ id: 'check', maxAgeSeconds: 300 }] })
const hourOldEvidence: CompanionEvidence[] = [{ id: 'check', status: 'pass', checkedAt: NOW - 3600 }]

/** What each verifier says about the thing that has run out, at the given time. */
function outOfDate(now: number): Record<string, string[]> {
  return {
    'stale assertion': verifyUseCaseProfile(staleAssertion, profile, { ...gate, now }).errors,
    'expired assertion': verifyUseCaseProfile(expiredAssertion, profile, { ...gate, now }).errors,
    'expired manifest': verifyCircleManifest(expiredManifest, { now }).errors,
    'expired manifest, resolved': resolveCircleManifests([expiredManifest], { now }).errors,
    'expired bundle': verifySignedDeploymentBundle(expiredBundle, { now, trustedPublishers: [expiredBundle.signer] }).errors,
    'expired challenge': verifyAdmissionPresentation(lateForChallenge, expiredChallenge, { now }).errors,
    'stale evidence': verifyDeploymentPolicy(dated(0), evidencePolicy, { now, companionEvidence: hourOldEvidence }).errors,
  }
}

// Everything in date at NOW, for one whole production or admission call
const manifest = createCircleManifest({
  issuedAt: NOW - 10,
  expiresAt: NOW + 600,
  members: [...circle.members],
  name: 'Reviewers',
  profileIds: [profile.id],
  purpose: 'Time tests',
})
const bundle = createSignedDeploymentBundle(
  createDeploymentPolicy(profile, {
    circleManifests: [manifest],
    companionEvidence: [{ id: 'check', maxAgeSeconds: 300 }],
    expectedSubject: subject,
    now: NOW,
    requireNostrSignature: true,
  }),
  { expiresAt: NOW + 600, id: 'in-date', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
)
const signedAssertion = signEvent(dated(0), PUBLISHER_KEY)
const challenge = createAdmissionChallenge({
  applicantPubkey: subject,
  audience,
  expiresAt: NOW + 60,
  issuedAt: NOW - 10,
  nonce: 'cd'.repeat(32),
})
const presentation = createAdmissionPresentation(challenge, APPLICANT_KEY, { createdAt: NOW })
const freshEvidence: CompanionEvidence[] = [{ id: 'check', status: 'pass', checkedAt: NOW }]

function production(now: number) {
  return verifyProductionDeployment(signedAssertion, bundle, {
    companionEvidence: freshEvidence,
    now,
    trustedPublishers: [bundle.signer],
  })
}

function admission(now: number) {
  return verifyAdmissionRequest(signedAssertion, bundle, challenge, presentation, {
    companionEvidence: freshEvidence,
    expectedAudience: audience,
    now,
    trustedPublishers: [bundle.signer],
  })
}

// Against NaN, or a word that reads as NaN, every comparison is false: a bundle
// never expires and an assertion never goes stale.
describe('a verification time that cannot be compared', () => {
  it.each([
    ['NaN', Number.NaN],
    ['a word', 'abc'],
    ['an empty string', ''],
    ['an object', {}],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('is reported once by each verifier, which then accepts nothing: %s', (_name, value) => {
    for (const [what, errors] of Object.entries(outOfDate(value as number))) {
      expect(errors, what).toEqual([TIME])
    }
  })

  it('is reported once by a whole production call, and fails each part of it', () => {
    const result = production(Number.NaN)
    const controls = createProductionDecisionReport(result).controls
    const status = (id: string) => controls.find(item => item.id === id)?.status

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([TIME])
    expect(result.issues.map(issue => issue.code)).toEqual(['verification.now_invalid'])
    expect(result.bundle.valid).toBe(false)
    expect(result.deployment.valid).toBe(false)
    expect(result.deployment.profileVerification.valid).toBe(false)
    expect(result.deployment.companionEvidence.valid).toBe(false)
    expect(status('bundle-freshness')).toBe('fail')
    expect(status('proof-threshold')).toBe('fail')
  })

  it('is reported once by a whole admission call, which denies', () => {
    const result = admission(Number.NaN)

    expect(result.decision).toBe('deny')
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([TIME])
  })

  it('is refused when a policy is created', () => {
    expect(() => createDeploymentPolicy(profile, { ...gate, now: Number.NaN })).toThrow(TIME)
    expect(() => createDeploymentPolicy(profile, { ...gate, now: 'abc' as unknown as number })).toThrow(TIME)
  })

  it('has its own code, read only from the whole message', () => {
    expect(classifyVerificationError(TIME).code).toBe('verification.now_invalid')
    expect(explainVerificationIssue('verification.now_invalid').action).toBe('operator-action')
    // The syntax and metric messages quote tag names taken from the event
    expect(classifyVerificationError(`event[0] metric "${TIME}" is not allowed by deployment policy`).code)
      .toBe('metric.unknown')
    const named = { ...dated(0), tags: [...proof.tags, [TIME, '1']] }
    expect(verifyDeploymentPolicy(named, createDeploymentPolicy(profile, gate), { now: NOW }).issues?.map(issue => issue.code))
      .toEqual(['nip85.syntax_invalid', 'proof.invalid'])
  })
})

describe('a verification time that can be compared', () => {
  const caught = {
    'stale assertion': ['event[0] assertion is outside the accepted freshness window'],
    'expired assertion': [`event[0] assertion has expired (NIP-40 expiration ${NOW - 600})`],
    'expired manifest': ['manifest is expired'],
    'expired manifest, resolved': ['manifest[0]: manifest is expired'],
    'expired bundle': ['bundle is expired'],
    'expired challenge': ['admission challenge is expired'],
    'stale evidence': ['companion evidence "check" is outside the accepted freshness window'],
  }

  // Callers who pass these work today, so they keep working
  it.each([
    ['a whole number', NOW],
    ['a numeric string', String(NOW)],
    ['a fraction', NOW + 0.5],
  ])('catches everything that has run out when now is %s', (_name, value) => {
    expect(outOfDate(value as number)).toEqual(caught)
  })

  it('accepts a whole production call and a whole admission call in date', () => {
    expect(production(NOW).errors).toEqual([])
    expect(production(NOW).decision).toBe('accept')
    expect(admission(NOW).errors).toEqual([])
    expect(admission(String(NOW) as unknown as number).errors).toEqual([])
  })

  it('reads no time, or null, as the current time', () => {
    // Long past by any clock this suite will run under
    for (const now of [undefined, null as unknown as number]) {
      const errors = verifySignedDeploymentBundle(expiredBundle, { now, trustedPublishers: [expiredBundle.signer] }).errors
      expect(errors).toEqual(['bundle is expired'])
    }
  })
})
