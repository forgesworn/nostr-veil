import { describe, expect, it } from 'vitest'
import {
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  classifyVerificationError,
  contributeAssertion,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  explainVerificationIssue,
  signEvent,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { CompanionEvidence, EventTemplate, UseCaseDeploymentPolicy } from '../../src/index.js'

const NOW = 1_778_000_000
const YEAR = 365 * 86_400
const WINDOW = 'maxAgeSeconds must be a non-negative integer'

const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => {
  const priv = byte.repeat(32)
  return { priv, pub: signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, priv).pubkey }
})
const circle = createTrustCircle(members.map(member => member.pub))
const subject = 'dd'.repeat(32)
const contributions = [90, 85, 80].map((rank, index) => contributeAssertion(
  circle,
  subject,
  { rank },
  members[index].priv,
  circle.members.indexOf(members[index].pub),
  { proofVersion: 'v2' },
))

/** The same proof, dated the given number of seconds from now. */
function dated(secondsFromNow: number): EventTemplate {
  return { ...aggregateContributions(circle, subject, contributions), created_at: NOW + secondsFromNow }
}

const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject }
const policy = createDeploymentPolicy(profile, gate)

/** The policy as a verifier reads it out of a bundle, with one field replaced. */
function tampered(fields: Record<string, unknown>): UseCaseDeploymentPolicy {
  return { ...(JSON.parse(JSON.stringify(policy)) as UseCaseDeploymentPolicy), ...fields }
}

function codes(result: { issues?: ReadonlyArray<{ code: string }> }): string[] {
  return (result.issues ?? []).map(issue => issue.code)
}

// `maxAgeSeconds > 0` is false for a word, an object or a negative number. Read
// as it stands, such a value switches the freshness window off, and the future
// bound inside it, without a word.
describe('a freshness window that is not a non-negative integer', () => {
  it.each([
    ['a word', 'abc'],
    ['a numeric string', '300'],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['an object', {}],
    ['a list', []],
    ['true', true],
    // What NaN becomes in JSON. A policy always carries the field.
    ['null', null],
  ])('rejects every event when a policy read from JSON holds %s', (_name, value) => {
    for (const event of [dated(0), dated(-YEAR), dated(10 * YEAR)]) {
      const result = verifyDeploymentPolicy(event, tampered({ maxAgeSeconds: value }), { now: NOW })

      expect(result.decision).toBe('reject')
      expect(result.errors).toEqual([WINDOW])
      expect(codes(result)).toEqual(['policy.max_age_seconds_invalid'])
    }
  })

  it('gives one error when an allowance is set beside it', () => {
    const result = verifyDeploymentPolicy(dated(0), tampered({ maxAgeSeconds: 'abc', maxFutureSeconds: 60 }), { now: NOW })

    expect(result.errors).toEqual([WINDOW])
  })

  it('reads the verifier option and the profile the same way', () => {
    const fromOption = verifyUseCaseProfile(dated(-YEAR), profile, { ...gate, now: NOW, maxAgeSeconds: Number.NaN })
    const fromProfile = verifyUseCaseProfile(
      dated(-YEAR),
      { ...profile, maxAgeSeconds: 'abc' as unknown as number },
      { ...gate, now: NOW },
    )

    expect(fromOption.errors).toEqual([WINDOW])
    expect(fromProfile.errors).toEqual([WINDOW])
  })

  it('still reads 0 as the window being off, and a whole number as the window', () => {
    expect(verifyDeploymentPolicy(dated(-YEAR), tampered({ maxAgeSeconds: 0 }), { now: NOW }).decision).toBe('accept')
    expect(verifyDeploymentPolicy(dated(-3600), tampered({ maxAgeSeconds: 3600 }), { now: NOW }).decision).toBe('accept')
    expect(verifyDeploymentPolicy(dated(-3601), tampered({ maxAgeSeconds: 3600 }), { now: NOW }).errors)
      .toEqual(['event[0] assertion is outside the accepted freshness window'])
  })

  // The proof-threshold control is the one that says the freshness checks passed
  it('fails the freshness control of the production report', () => {
    const signedPolicy = createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true })
    const bundle = createSignedDeploymentBundle(
      { ...(JSON.parse(JSON.stringify(signedPolicy)) as UseCaseDeploymentPolicy), maxAgeSeconds: 'abc' as unknown as number },
      { expiresAt: NOW + 600, id: 'malformed-window', issuedAt: NOW, privateKey: '44'.repeat(32) },
    )
    const result = verifyProductionDeployment(signEvent(dated(0), '55'.repeat(32)), bundle, {
      now: NOW,
      trustedPublishers: [bundle.signer],
    })
    const control = createProductionDecisionReport(result).controls.find(item => item.id === 'proof-threshold')

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([WINDOW])
    expect(control?.status).toBe('fail')
  })

  it('has its own code, read only from the whole message', () => {
    expect(classifyVerificationError(WINDOW).code).toBe('policy.max_age_seconds_invalid')
    expect(explainVerificationIssue('policy.max_age_seconds_invalid').action).toBe('operator-action')
    // The syntax and metric messages quote tag names taken from the event
    expect(classifyVerificationError(`event[0] metric "${WINDOW}" is not allowed by deployment policy`).code)
      .toBe('metric.unknown')
    const named = { ...dated(0), tags: [...dated(0).tags, [WINDOW, '1']] }
    expect(codes(verifyDeploymentPolicy(named, policy, { now: NOW }))).toEqual(['nip85.syntax_invalid', 'proof.invalid'])
  })
})

// The same test guards each companion evidence requirement
describe('a companion evidence window that is not a non-negative integer', () => {
  const hourOld: CompanionEvidence[] = [{ id: 'check', status: 'pass', checkedAt: NOW - 3600 }]
  const withWindow = (maxAgeSeconds: unknown): UseCaseDeploymentPolicy =>
    tampered({ companionEvidence: [{ id: 'check', ...(maxAgeSeconds === undefined ? {} : { maxAgeSeconds }) }] })

  it.each([
    ['a word', 'abc'],
    ['a numeric string', '300'],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['an object', {}],
    ['null', null],
  ])('rejects evidence when the requirement holds %s', (_name, value) => {
    const result = verifyDeploymentPolicy(dated(0), withWindow(value), { now: NOW, companionEvidence: hourOld })

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual(['companion evidence "check" maxAgeSeconds must be a non-negative integer'])
    expect(codes(result)).toEqual(['companion.invalid'])
  })

  it('still reads no window, or a window of 0, as unchecked, and a whole number as the window', () => {
    const verify = (maxAgeSeconds: unknown) =>
      verifyDeploymentPolicy(dated(0), withWindow(maxAgeSeconds), { now: NOW, companionEvidence: hourOld })

    expect(verify(undefined).decision).toBe('accept')
    expect(verify(0).decision).toBe('accept')
    expect(verify(3600).decision).toBe('accept')
    expect(verify(300).errors).toEqual(['companion evidence "check" is outside the accepted freshness window'])
  })

  // The window is checked before the evidence is looked up, so a malformed one
  // is reported whether or not the evidence was supplied
  it('reports the window once, with or without the evidence', () => {
    const malformed = 'companion evidence "check" maxAgeSeconds must be a non-negative integer'
    const optional = tampered({ companionEvidence: [{ id: 'check', required: false, maxAgeSeconds: 'abc' }] })
    const required = tampered({ companionEvidence: [{ id: 'check', required: true, maxAgeSeconds: 'abc' }] })

    expect(verifyDeploymentPolicy(dated(0), optional, { now: NOW }).errors).toEqual([malformed])
    expect(verifyDeploymentPolicy(dated(0), optional, { now: NOW, companionEvidence: hourOld }).errors).toEqual([malformed])
    expect(verifyDeploymentPolicy(dated(0), required, { now: NOW }).errors)
      .toEqual([malformed, 'companion evidence "check" is missing'])
  })

  // createDeploymentPolicy reads a null window as none, as it reads a null
  // maxAgeSeconds or minDistinctSigners as the profile's. It must not then
  // store the null, which the verifier rejects in a policy read from JSON.
  it('never creates a policy that its own verifier rejects', () => {
    const created = createDeploymentPolicy(profile, {
      ...gate,
      companionEvidence: [{ id: 'check', maxAgeSeconds: null as unknown as number }],
    })

    expect(created.companionEvidence).toEqual([{ id: 'check', required: true }])
    expect(verifyDeploymentPolicy(dated(0), created, { now: NOW, companionEvidence: hourOld }).decision).toBe('accept')
    // And after the journey through a bundle
    const read = JSON.parse(JSON.stringify(created)) as UseCaseDeploymentPolicy
    expect(verifyDeploymentPolicy(dated(0), read, { now: NOW, companionEvidence: hourOld }).decision).toBe('accept')
  })

  it('tells the operator to correct the requirement, where that is what is wrong', () => {
    const explained = explainVerificationIssue('companion.invalid')

    expect(explained.action).toBe('operator-action')
    expect(explained.remediation).toContain('maxAgeSeconds')
    expect(explained.remediation).toContain('reissue')
  })
})
