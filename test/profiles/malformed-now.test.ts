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

  // No manifest expiry and no evidence age was compared, so the controls that
  // report them cannot read pass
  it('fails the circle and evidence controls of the report where they depend on the time', () => {
    const statusAt = (now: number) => {
      const controls = createProductionDecisionReport(production(now)).controls
      return (id: string) => controls.find(item => item.id === id)?.status
    }

    expect(statusAt(NOW)('circle-policy')).toBe('pass')
    expect(statusAt(NOW)('companion-evidence')).toBe('pass')
    expect(statusAt(Number.NaN)('circle-policy')).toBe('fail')
    expect(statusAt(Number.NaN)('companion-evidence')).toBe('fail')
  })

  it('leaves those controls as they were where nothing is compared against the time', () => {
    // Circle ids with no manifest, and evidence with no window
    const timeless = (companionEvidence: Array<{ id: string }> | undefined) => {
      const timelessBundle = createSignedDeploymentBundle(
        createDeploymentPolicy(profile, { ...gate, companionEvidence, requireNostrSignature: true }),
        { expiresAt: NOW + 600, id: 'timeless', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
      )
      const result = verifyProductionDeployment(signedAssertion, timelessBundle, {
        companionEvidence: companionEvidence === undefined ? undefined : freshEvidence,
        now: Number.NaN,
        trustedPublishers: [timelessBundle.signer],
      })
      const controls = createProductionDecisionReport(result).controls
      return { result, status: (id: string) => controls.find(item => item.id === id)?.status }
    }

    const withEvidence = timeless([{ id: 'check' }])
    expect(withEvidence.result.decision).toBe('reject')
    expect(withEvidence.result.errors).toEqual([TIME])
    expect(withEvidence.status('circle-policy')).toBe('pass')
    expect(withEvidence.status('companion-evidence')).toBe('pass')
    expect(withEvidence.status('bundle-freshness')).toBe('fail')
    expect(withEvidence.status('proof-threshold')).toBe('fail')

    expect(timeless(undefined).status('companion-evidence')).toBe('not-checked')
  })

  // An optional requirement with a window, and no evidence supplied for it:
  // there was nothing to age, so the control reads as it does at any other time
  it('does not fail the evidence control when there was no evidence to age', () => {
    const optionalBundle = createSignedDeploymentBundle(
      createDeploymentPolicy(profile, {
        ...gate,
        companionEvidence: [{ id: 'check', maxAgeSeconds: 300, required: false }],
        requireNostrSignature: true,
      }),
      { expiresAt: NOW + 600, id: 'optional', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
    )
    const statusAt = (now: number, companionEvidence?: CompanionEvidence[]) => {
      const result = verifyProductionDeployment(signedAssertion, optionalBundle, {
        companionEvidence,
        now,
        trustedPublishers: [optionalBundle.signer],
      })
      return createProductionDecisionReport(result).controls.find(item => item.id === 'companion-evidence')?.status
    }

    expect(statusAt(NOW)).toBe('not-checked')
    expect(statusAt(Number.NaN)).toBe('not-checked')
    // Once it is supplied, its age is what could not be compared
    expect(statusAt(NOW, freshEvidence)).toBe('pass')
    expect(statusAt(Number.NaN, freshEvidence)).toBe('fail')
  })

  // The verifier reports a requirement window that is not a number as
  // malformed, and compares nothing against it. JSON can carry an object that
  // cannot be converted to a number at all.
  it('does not stop the report on a requirement window that cannot be converted', () => {
    const window: unknown = JSON.parse('{"toString":1}')
    const unconvertible = createSignedDeploymentBundle(
      {
        ...createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true }),
        companionEvidence: [{ id: 'check', maxAgeSeconds: window as number, required: false }],
      },
      { expiresAt: NOW + 600, id: 'unconvertible', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
    )

    for (const now of [NOW, Number.NaN]) {
      for (const companionEvidence of [undefined, freshEvidence]) {
        const label = `${now} ${companionEvidence === undefined ? 'without' : 'with'} evidence`
        const result = verifyProductionDeployment(signedAssertion, unconvertible, {
          companionEvidence,
          now,
          trustedPublishers: [unconvertible.signer],
        })
        expect(result.bundle.valid, label).toBe(now === NOW)
        expect(result.issues.map(issue => issue.code), label).toContain('companion.invalid')

        const controls = createProductionDecisionReport(result).controls
        expect(controls.find(item => item.id === 'companion-evidence')?.status, label).toBe('fail')
      }
    }
  })

  // A malformed window was not applied, and no evidence was aged against a
  // time that cannot be compared. The control reads the window from the
  // requirement, not from the issue reported for it.
  it('fails the evidence control for a malformed window under an unusable now, from the window alone', () => {
    const statusFor = (window: unknown) => {
      const bundle = createSignedDeploymentBundle(
        {
          ...createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true }),
          companionEvidence: [{ id: 'check', maxAgeSeconds: window as number, required: false }],
        },
        { expiresAt: NOW + 600, id: 'window', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
      )
      const result = verifyProductionDeployment(signedAssertion, bundle, {
        companionEvidence: freshEvidence,
        now: Number.NaN,
        trustedPublishers: [bundle.signer],
      })
      const uncoded = { ...result, issues: result.issues.filter(issue => !issue.code.startsWith('companion.')) }
      return { result, status: createProductionDecisionReport(uncoded).controls.find(item => item.id === 'companion-evidence')?.status }
    }

    for (const window of ['5', 'abc', null, true, -1, 1.5, [5], {}, JSON.parse('{"toString":1}')]) {
      const label = JSON.stringify(window)
      const { result, status } = statusFor(window)
      expect(result.errors, label).toContain('companion evidence "check" maxAgeSeconds must be a non-negative integer')
      expect(status, label).toBe('fail')
    }
    // A window of zero, or none, has no age to compare
    expect(statusFor(0).status).toBe('pass')
    expect(statusFor(undefined).status).toBe('pass')
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
