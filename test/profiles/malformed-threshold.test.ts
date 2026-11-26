import { describe, expect, it } from 'vitest'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  classifyVerificationError,
  computeCircleId,
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
const THRESHOLD = 'minDistinctSigners must be a positive integer'

const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => {
  const priv = byte.repeat(32)
  return { priv, pub: signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, priv).pubkey }
})
const circle = createTrustCircle(members.map(member => member.pub))
const subject = 'dd'.repeat(32)

/** One score from each of the first members, published as their median. */
function scores(ranks: number[]): EventTemplate {
  const contributions = ranks.map((rank, index) => contributeAssertion(
    circle,
    subject,
    { rank },
    members[index].priv,
    circle.members.indexOf(members[index].pub),
    { proofVersion: 'v2' },
  ))
  return { ...aggregateContributions(circle, subject, contributions), created_at: NOW }
}

const oneSigner = scores([90])
const threeSigners = scores([90, 85, 80])

const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject }
const policy = createDeploymentPolicy(profile, gate)

/** A policy as a verifier reads it out of a bundle, with fields replaced. */
function tampered(fields: Record<string, unknown>, from: UseCaseDeploymentPolicy = policy): UseCaseDeploymentPolicy {
  return { ...(JSON.parse(JSON.stringify(from)) as UseCaseDeploymentPolicy), ...fields }
}

function codes(result: { issues?: ReadonlyArray<{ code: string }> }): string[] {
  return (result.issues ?? []).map(issue => issue.code)
}

// `signers < threshold` is false for a word or an object, and nothing is below
// zero. Read as it stands, such a threshold lets a single signer through.
describe('a signer threshold that is not a positive integer', () => {
  it.each([
    ['a word', 'abc'],
    ['a numeric string', '3'],
    ['an object', {}],
    ['a negative number', -1],
    ['zero', 0],
    ['a fraction', 2.5],
    ['true', true],
    // What NaN becomes in JSON. A policy always carries the field.
    ['null', null],
  ])('rejects every event when a policy read from JSON holds %s', (_name, value) => {
    for (const event of [oneSigner, threeSigners]) {
      const result = verifyDeploymentPolicy(event, tampered({ minDistinctSigners: value }), { now: NOW })

      expect(result.decision).toBe('reject')
      expect(result.errors).toEqual([THRESHOLD])
      expect(codes(result)).toEqual(['policy.min_distinct_signers_invalid'])
    }
  })

  it('reads the verifier option and the profile the same way', () => {
    const fromOption = verifyUseCaseProfile(oneSigner, profile, { ...gate, now: NOW, minDistinctSigners: Number.NaN })
    const fromProfile = verifyUseCaseProfile(
      oneSigner,
      { ...profile, minDistinctSigners: 'abc' as unknown as number },
      { ...gate, now: NOW },
    )

    expect(fromOption.errors).toEqual([THRESHOLD])
    expect(fromProfile.errors).toEqual([THRESHOLD])
  })

  it('still applies a whole number as the threshold', () => {
    expect(verifyDeploymentPolicy(oneSigner, policy, { now: NOW }).errors)
      .toEqual([`event[0] has fewer than ${profile.minDistinctSigners} distinct signers`])
    expect(verifyDeploymentPolicy(oneSigner, tampered({ minDistinctSigners: 1 }), { now: NOW }).decision).toBe('accept')
    expect(verifyDeploymentPolicy(threeSigners, policy, { now: NOW }).decision).toBe('accept')
  })

  // A federation counts signers across its events, in a second place
  it('reads a federation threshold the same way, and reports it once', () => {
    const federationNow = moderationEvents[0].created_at ?? NOW
    const federationPolicy = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
      acceptedCircleIds: moderationEvents.map(event => computeCircleId(event.tags.find(tag => tag[0] === 'veil-ring')!.slice(1))),
      expectedSubject: moderationEvents[0].tags.find(tag => tag[0] === 'd')![1],
    })
    const verify = (minDistinctSigners: unknown) =>
      verifyDeploymentPolicy(moderationEvents, tampered({ minDistinctSigners }, federationPolicy), { now: federationNow })

    expect(verify(FEDERATED_MODERATION_PROFILE.minDistinctSigners).errors).toEqual([])
    expect(verify(1000).errors).toEqual(['federation has fewer than 1000 distinct signers'])
    expect(verify('abc').errors).toEqual([THRESHOLD])
    expect(verify(0).errors).toEqual([THRESHOLD])
  })

  it('fails the threshold control of the production report', () => {
    const signedPolicy = createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true })
    const bundle = createSignedDeploymentBundle(tampered({ minDistinctSigners: 'abc' }, signedPolicy), {
      expiresAt: NOW + 600,
      id: 'malformed-threshold',
      issuedAt: NOW,
      privateKey: '44'.repeat(32),
    })
    const result = verifyProductionDeployment(signEvent(oneSigner, '55'.repeat(32)), bundle, {
      now: NOW,
      trustedPublishers: [bundle.signer],
    })
    const control = createProductionDecisionReport(result).controls.find(item => item.id === 'proof-threshold')

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([THRESHOLD])
    expect(control?.status).toBe('fail')
  })

  it('has its own code, read only from the whole message', () => {
    expect(classifyVerificationError(THRESHOLD).code).toBe('policy.min_distinct_signers_invalid')
    expect(explainVerificationIssue('policy.min_distinct_signers_invalid').action).toBe('operator-action')
    // The syntax and metric messages quote tag names taken from the event
    expect(classifyVerificationError(`event[0] metric "${THRESHOLD}" is not allowed by deployment policy`).code)
      .toBe('metric.unknown')
    const named = { ...threeSigners, tags: [...threeSigners.tags, [THRESHOLD, '1']] }
    expect(codes(verifyDeploymentPolicy(named, policy, { now: NOW }))).toEqual(['nip85.syntax_invalid', 'proof.invalid'])
  })
})
