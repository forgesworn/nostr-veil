import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_FUTURE_SECONDS,
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
import type { EventTemplate, UseCaseDeploymentPolicy } from '../../src/index.js'

const NOW = 1_778_000_000
const TEN_YEARS = 10 * 365 * 86_400
const FUTURE = 'event[0] assertion created_at is in the future'
const STALE = 'event[0] assertion is outside the accepted freshness window'
const MALFORMED = 'maxFutureSeconds must be a non-negative integer'

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

function errorsFor(event: EventTemplate, options: { maxAgeSeconds?: number; maxFutureSeconds?: number } = {}): string[] {
  return verifyUseCaseProfile(event, profile, { ...gate, now: NOW, ...options }).errors
}

function codes(result: { issues?: ReadonlyArray<{ code: string }> }): string[] {
  return (result.issues ?? []).map(issue => issue.code)
}

describe('an assertion dated in the future', () => {
  // Only the signer sets created_at. An event dated ahead stays inside the
  // window until that date plus the window, so without an upper bound a
  // publisher chooses how long an assertion counts as fresh.
  it('is rejected, however far ahead and however long the window', () => {
    expect(errorsFor(dated(TEN_YEARS))).toEqual([FUTURE])
    expect(errorsFor(dated(TEN_YEARS), { maxAgeSeconds: 365 * 86_400 })).toEqual([FUTURE])

    const result = verifyDeploymentPolicy(dated(TEN_YEARS), policy, { now: NOW })
    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([FUTURE])
    expect(codes(result)).toEqual(['assertion.created_at_future'])
  })

  it('is accepted up to the default allowance and rejected one second past it', () => {
    expect(errorsFor(dated(0))).toEqual([])
    expect(errorsFor(dated(DEFAULT_MAX_FUTURE_SECONDS))).toEqual([])
    expect(errorsFor(dated(DEFAULT_MAX_FUTURE_SECONDS + 1))).toEqual([FUTURE])
  })

  it('takes the allowance from the verifier option', () => {
    expect(errorsFor(dated(0), { maxFutureSeconds: 0 })).toEqual([])
    expect(errorsFor(dated(1), { maxFutureSeconds: 0 })).toEqual([FUTURE])
    expect(errorsFor(dated(3600), { maxFutureSeconds: 3600 })).toEqual([])
    expect(errorsFor(dated(3601), { maxFutureSeconds: 3600 })).toEqual([FUTURE])
  })

  // Both figures differ from the default, so neither passes with the policy's value ignored
  it('takes the allowance from the deployment policy', () => {
    const strict = createDeploymentPolicy(profile, { ...gate, maxFutureSeconds: 10 })
    const lenient = createDeploymentPolicy(profile, { ...gate, maxFutureSeconds: 3600 })

    expect(strict.maxFutureSeconds).toBe(10)
    expect(verifyDeploymentPolicy(dated(10), strict, { now: NOW }).decision).toBe('accept')
    expect(verifyDeploymentPolicy(dated(11), strict, { now: NOW }).errors).toEqual([FUTURE])
    expect(verifyDeploymentPolicy(dated(3600), lenient, { now: NOW }).decision).toBe('accept')
    expect(verifyDeploymentPolicy(dated(3601), lenient, { now: NOW }).errors).toEqual([FUTURE])
    // After the round trip a signed bundle makes
    const parsed = JSON.parse(JSON.stringify(strict)) as UseCaseDeploymentPolicy
    expect(verifyDeploymentPolicy(dated(11), parsed, { now: NOW }).errors).toEqual([FUTURE])
  })

  it('leaves the field off a policy that does not set it, which then uses the default', () => {
    expect('maxFutureSeconds' in policy).toBe(false)
    expect(verifyDeploymentPolicy(dated(DEFAULT_MAX_FUTURE_SECONDS), policy, { now: NOW }).decision).toBe('accept')
    expect(verifyDeploymentPolicy(dated(DEFAULT_MAX_FUTURE_SECONDS + 1), policy, { now: NOW }).errors).toEqual([FUTURE])
  })

  it('still rejects an assertion older than the window', () => {
    expect(errorsFor(dated(-profile.maxAgeSeconds))).toEqual([])
    expect(errorsFor(dated(-profile.maxAgeSeconds - 1))).toEqual([STALE])
  })

  // With the window off there is no time check at all, as before
  it('is not checked when the freshness window is off', () => {
    expect(errorsFor(dated(TEN_YEARS), { maxAgeSeconds: 0 })).toEqual([])
    expect(errorsFor(dated(-TEN_YEARS), { maxAgeSeconds: 0 })).toEqual([])
  })

  // The stale check subtracts from now, which reads a numeric string as a
  // number. Adding to it joins two strings, and the upper end is gone.
  it('reads a now passed as a numeric string alike at both ends', () => {
    const now = String(NOW) as unknown as number
    const errors = (event: EventTemplate): string[] => verifyUseCaseProfile(event, profile, { ...gate, now }).errors

    expect(errors(dated(0))).toEqual([])
    expect(errors(dated(DEFAULT_MAX_FUTURE_SECONDS))).toEqual([])
    expect(errors(dated(DEFAULT_MAX_FUTURE_SECONDS + 1))).toEqual([FUTURE])
    expect(errors(dated(TEN_YEARS))).toEqual([FUTURE])
    expect(errors(dated(-TEN_YEARS))).toEqual([STALE])
    expect(verifyDeploymentPolicy(dated(TEN_YEARS), policy, { now }).decision).toBe('reject')
  })
})

// The allowance is the upper end of the freshness window. With the window off
// no date is checked, so an allowance set beside it would be read and dropped.
describe('an allowance set while the freshness window is off', () => {
  const UNUSED = 'maxFutureSeconds is set while maxAgeSeconds turns the freshness window off'

  it('is refused when a policy is created', () => {
    for (const maxFutureSeconds of [0, 60, 3600]) {
      expect(
        () => createDeploymentPolicy(profile, { ...gate, maxAgeSeconds: 0, maxFutureSeconds }),
        String(maxFutureSeconds),
      ).toThrow(UNUSED)
    }
  })

  it('is refused by the verifier, from its own options or from a policy built by hand', () => {
    expect(errorsFor(dated(0), { maxAgeSeconds: 0, maxFutureSeconds: 0 })).toEqual([UNUSED])
    expect(errorsFor(dated(TEN_YEARS), { maxAgeSeconds: 0, maxFutureSeconds: 0 })).toEqual([UNUSED])

    const handBuilt = {
      ...(JSON.parse(JSON.stringify(policy)) as UseCaseDeploymentPolicy),
      maxAgeSeconds: 0,
      maxFutureSeconds: 60,
    }
    for (const event of [dated(0), dated(TEN_YEARS)]) {
      const result = verifyDeploymentPolicy(event, handBuilt, { now: NOW })
      expect(result.decision).toBe('reject')
      expect(result.errors).toEqual([UNUSED])
      expect(codes(result)).toEqual(['policy.max_future_seconds_invalid'])
    }
  })

  it('leaves a policy with the window off and no allowance as it was', () => {
    const windowOff = createDeploymentPolicy(profile, { ...gate, maxAgeSeconds: 0 })

    expect('maxFutureSeconds' in windowOff).toBe(false)
    expect(verifyDeploymentPolicy(dated(TEN_YEARS), windowOff, { now: NOW }).decision).toBe('accept')
  })
})

describe('an assertion whose created_at is not a Unix timestamp', () => {
  const INVALID = 'event[0] assertion created_at is not a Unix timestamp'

  // Compared as it stands, a word or NaN is neither older than the window nor
  // ahead of it, so the assertion would pass both ends and never go stale
  it.each([
    ['a word', 'abc'],
    ['a numeric string', String(NOW)],
    ['an object', {}],
    ['a list', []],
    ['true', true],
    ['null', null],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['a fraction', NOW + 0.5],
  ])('rejects %s', (_name, value) => {
    const event = { ...dated(0), created_at: value as unknown as number }

    expect(errorsFor(event)).toEqual([INVALID])
    const result = verifyDeploymentPolicy(event, policy, { now: NOW })
    expect(result.decision).toBe('reject')
    expect(codes(result)).toEqual(['assertion.created_at_invalid'])
  })

  // NaN is a number, so it passes the signed-event shape check, and it signs
  it('rejects NaN on a signed event when the policy requires signatures', () => {
    const signedPolicy = createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true })
    const event = signEvent({ ...dated(0), created_at: Number.NaN }, '55'.repeat(32))

    expect(verifyDeploymentPolicy(event, signedPolicy, { now: NOW }).errors).toEqual([INVALID])
  })

  it('still reads a whole number of seconds, before 1970 included, as a date', () => {
    expect(errorsFor(dated(0))).toEqual([])
    expect(errorsFor({ ...dated(0), created_at: -5 })).toEqual([STALE])
  })

  it('keeps its own message for an assertion with no created_at', () => {
    const { created_at: _absent, ...undated } = dated(0)

    expect(errorsFor(undated)).toEqual(['event[0] missing created_at for freshness check'])
  })

  // With the window off there is no time check at all, as before
  it('is not checked when the freshness window is off', () => {
    expect(errorsFor({ ...dated(0), created_at: 'abc' as unknown as number }, { maxAgeSeconds: 0 })).toEqual([])
  })

  it('has its own code, read only from the whole message', () => {
    expect(classifyVerificationError('event[3] assertion created_at is not a Unix timestamp'))
      .toMatchObject({ code: 'assertion.created_at_invalid', path: 'event[3]' })
    expect(explainVerificationIssue('assertion.created_at_invalid').action).toBe('reject')
    expect(classifyVerificationError('event[0] syntax: Unknown metric tag "assertion created_at is not a Unix timestamp" for kind 30382.').code)
      .toBe('nip85.syntax_invalid')
  })
})

describe('a malformed future allowance', () => {
  it('is refused when a policy is created', () => {
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '60']) {
      expect(
        () => createDeploymentPolicy(profile, { ...gate, maxFutureSeconds: value as number }),
        String(value),
      ).toThrow(MALFORMED)
    }
  })

  // Compared as it stands, a string or NaN makes the test false and the upper
  // bound vanishes. A policy inside a signed bundle arrives as JSON.
  it.each([
    ['a numeric string', '60'],
    ['a word', 'abc'],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['an object', {}],
    ['a list', []],
    ['true', true],
    // What NaN and Infinity become in JSON. A well-formed policy never holds it.
    ['null', null],
  ])('fails closed on %s in a policy read from JSON', (_name, value) => {
    const tampered = {
      ...(JSON.parse(JSON.stringify(policy)) as UseCaseDeploymentPolicy),
      maxFutureSeconds: value as unknown as number,
    }

    for (const event of [dated(0), dated(TEN_YEARS)]) {
      const result = verifyDeploymentPolicy(event, tampered, { now: NOW })
      expect(result.decision).toBe('reject')
      expect(result.errors).toContain(MALFORMED)
      expect(codes(result)).toContain('policy.max_future_seconds_invalid')
    }
  })

  // The policy is at fault, not the publisher's clock. Nothing is compared
  // against a malformed allowance, so no event is called future-dated for it.
  it('is the only error for a malformed allowance, however far ahead the event is dated', () => {
    const tampered = {
      ...(JSON.parse(JSON.stringify(policy)) as UseCaseDeploymentPolicy),
      maxFutureSeconds: '60' as unknown as number,
    }

    for (const event of [dated(0), dated(30), dated(TEN_YEARS)]) {
      const result = verifyDeploymentPolicy(event, tampered, { now: NOW })
      expect(result.decision).toBe('reject')
      expect(result.errors).toEqual([MALFORMED])
      expect(codes(result)).toEqual(['policy.max_future_seconds_invalid'])
    }
  })

  it('reads the same malformed value the same way before and after JSON', () => {
    const handBuilt = { ...policy, maxFutureSeconds: Number.NaN }
    const parsed = JSON.parse(JSON.stringify(handBuilt)) as UseCaseDeploymentPolicy

    expect(verifyDeploymentPolicy(dated(0), handBuilt, { now: NOW }).errors).toEqual([MALFORMED])
    expect(verifyDeploymentPolicy(dated(0), parsed, { now: NOW }).errors).toEqual([MALFORMED])
  })

  it('fails closed on NaN or null passed straight to the verifier', () => {
    expect(errorsFor(dated(0), { maxFutureSeconds: Number.NaN })).toEqual([MALFORMED])
    // Nothing is compared against a malformed allowance, so the date is not judged
    expect(errorsFor(dated(TEN_YEARS), { maxFutureSeconds: Number.NaN })).toEqual([MALFORMED])
    expect(errorsFor(dated(0), { maxFutureSeconds: null as unknown as number })).toEqual([MALFORMED])
  })

  // The proof-threshold control is the one that says the freshness checks passed
  it('fails the freshness control of the production report', () => {
    const tampered = {
      ...(JSON.parse(JSON.stringify(createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true }))) as UseCaseDeploymentPolicy),
      maxFutureSeconds: '60' as unknown as number,
    }
    const bundle = createSignedDeploymentBundle(tampered, {
      expiresAt: NOW + 600,
      id: 'malformed-allowance',
      issuedAt: NOW,
      privateKey: '44'.repeat(32),
    })
    const result = verifyProductionDeployment(signEvent(dated(0), '55'.repeat(32)), bundle, {
      now: NOW,
      trustedPublishers: [bundle.signer],
    })
    const control = createProductionDecisionReport(result).controls.find(item => item.id === 'proof-threshold')

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([MALFORMED])
    expect(control?.status).toBe('fail')
  })
})

describe('the issue codes for a future date', () => {
  it('classifies both messages and says what to do', () => {
    expect(classifyVerificationError('event[2] assertion created_at is in the future'))
      .toMatchObject({ code: 'assertion.created_at_future', path: 'event[2]' })
    expect(classifyVerificationError(MALFORMED).code).toBe('policy.max_future_seconds_invalid')

    expect(explainVerificationIssue('assertion.created_at_future').action).toBe('reject')
    expect(explainVerificationIssue('assertion.created_at_future').remediation).toContain('maxFutureSeconds')
    expect(explainVerificationIssue('policy.max_future_seconds_invalid').action).toBe('operator-action')
    // The value can come from a verifier option, with no policy or bundle involved
    expect(explainVerificationIssue('policy.max_future_seconds_invalid').remediation).toContain('verifier option')
    expect(classifyVerificationError('maxFutureSeconds is set while maxAgeSeconds turns the freshness window off').code)
      .toBe('policy.max_future_seconds_invalid')
  })

  // The syntax and metric messages quote tag names taken from the event
  it('reads either code only from the whole message the verifier writes', () => {
    expect(classifyVerificationError('event[0] syntax: Unknown metric tag "assertion created_at is in the future" for kind 30382.').code)
      .toBe('nip85.syntax_invalid')
    expect(classifyVerificationError('event[0] metric "maxFutureSeconds must be a non-negative integer" is not allowed by deployment policy').code)
      .toBe('metric.unknown')
  })

  it('does not let a tag name in the event produce either code', () => {
    const report = (tagName: string) => {
      const event = { ...dated(0), tags: [...dated(0).tags, [tagName, '1']] }
      return codes(verifyDeploymentPolicy(event, policy, { now: NOW }))
    }
    const anyUnknownTag = report('zzz')

    expect(anyUnknownTag).toEqual(['nip85.syntax_invalid', 'proof.invalid'])
    expect(report('assertion created_at is in the future')).toEqual(anyUnknownTag)
    expect(report('maxFutureSeconds must be a non-negative integer')).toEqual(anyUnknownTag)
  })
})
