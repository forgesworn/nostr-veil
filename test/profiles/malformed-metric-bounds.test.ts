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
import type { DeploymentMetricPolicy, EventTemplate, UseCaseDeploymentPolicy } from '../../src/index.js'

const NOW = 1_778_000_000

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

const threeSigners = scores([90, 85, 80])
const lowScore = scores([20, 20, 20])

const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject }
const policy = createDeploymentPolicy(profile, gate)

/** A policy as a verifier reads it out of a bundle, with fields replaced. */
function tampered(fields: Record<string, unknown>, from: UseCaseDeploymentPolicy = policy): UseCaseDeploymentPolicy {
  return { ...(JSON.parse(JSON.stringify(from)) as UseCaseDeploymentPolicy), ...fields }
}

function codes(result: { issues?: ReadonlyArray<{ code: string }> }): string[] {
  return (result.issues ?? []).map(issue => issue.code)
}

// `score < minimum` is false for a word, an object or null, so a malformed
// bound read as it stands lets any score through the gate it was written for.
describe('a metric bound that is not a finite number', () => {
  const gated = (rank: Record<string, unknown>): UseCaseDeploymentPolicy => tampered({ metricPolicies: { rank } })
  const MIN = 'metricPolicies.rank.min must be a finite number'
  const MAX = 'metricPolicies.rank.max must be a finite number'

  it.each([
    ['a word', 'abc'],
    ['a numeric string', '70'],
    ['an object', {}],
    ['true', true],
    ['null', null],
  ])('rejects every event when a minimum read from JSON is %s', (_name, value) => {
    for (const event of [lowScore, threeSigners]) {
      const result = verifyDeploymentPolicy(event, gated({ required: true, min: value }), { now: NOW })

      expect(result.decision).toBe('reject')
      expect(result.errors).toEqual([MIN])
      expect(codes(result)).toEqual(['policy.metric_policy_invalid'])
    }
  })

  it('reads a maximum the same way, and both ends together', () => {
    expect(verifyDeploymentPolicy(threeSigners, gated({ max: 'abc' }), { now: NOW }).errors).toEqual([MAX])
    expect(verifyDeploymentPolicy(threeSigners, gated({ min: 'abc', max: {} }), { now: NOW }).errors).toEqual([MIN, MAX])
    expect(verifyDeploymentPolicy(threeSigners, gated({ min: 90, max: 10 }), { now: NOW }).errors)
      .toEqual(['metricPolicies.rank.min must be <= max'])
  })

  it('still applies finite bounds, and still checks the other metrics', () => {
    expect(verifyDeploymentPolicy(lowScore, gated({ required: true, min: 70 }), { now: NOW }).errors)
      .toEqual(['event[0] metric "rank" is below deployment minimum 70'])
    expect(verifyDeploymentPolicy(threeSigners, gated({ required: true, min: 70, max: 100 }), { now: NOW }).decision)
      .toBe('accept')

    const mixed = tampered({ metricPolicies: { rank: { min: 'abc' }, followers: { required: true } } })
    expect(verifyDeploymentPolicy(threeSigners, mixed, { now: NOW }).errors)
      .toEqual([MIN, 'event[0] missing required metric "followers"'])
  })

  it('applies at creation the checks it applies at verification', () => {
    const create = (rank: Record<string, unknown>) => () =>
      createDeploymentPolicy(profile, { ...gate, metricPolicies: { rank: rank as DeploymentMetricPolicy } })

    expect(create({ min: 'abc' })).toThrow(MIN)
    expect(create({ min: null })).toThrow(MIN)
    expect(create({ max: '70' })).toThrow(MAX)
    expect(create({ min: 90, max: 10 })).toThrow('metricPolicies.rank.min must be <= max')
    expect(create({ min: 70, max: 100 })).not.toThrow()
  })

  it('reports a malformed bound once, however many events there are', () => {
    const result = verifyDeploymentPolicy([threeSigners, threeSigners], gated({ min: 'abc' }), { now: NOW })

    expect(result.errors.filter(error => error === MIN)).toHaveLength(1)
  })

  it('fails the metric control of the production report', () => {
    const signedPolicy = createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true })
    const bundle = createSignedDeploymentBundle(tampered({ metricPolicies: { rank: { min: 'abc' } } }, signedPolicy), {
      expiresAt: NOW + 600,
      id: 'malformed-bound',
      issuedAt: NOW,
      privateKey: '44'.repeat(32),
    })
    const result = verifyProductionDeployment(signEvent(lowScore, '55'.repeat(32)), bundle, {
      now: NOW,
      trustedPublishers: [bundle.signer],
    })
    const control = createProductionDecisionReport(result).controls.find(item => item.id === 'metric-policy')

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([MIN])
    expect(control?.status).toBe('fail')
  })

  it('has its own code, read only from the whole message', () => {
    expect(classifyVerificationError(MIN).code).toBe('policy.metric_policy_invalid')
    expect(classifyVerificationError('metricPolicies.rank.min must be <= max').code).toBe('policy.metric_policy_invalid')
    expect(explainVerificationIssue('policy.metric_policy_invalid').action).toBe('operator-action')
    // The syntax and metric messages quote tag names taken from the event
    expect(classifyVerificationError(`event[0] metric "${MIN}" is not allowed by deployment policy`).code)
      .toBe('metric.unknown')
    const named = { ...threeSigners, tags: [...threeSigners.tags, [MIN, '1']] }
    expect(codes(verifyDeploymentPolicy(named, policy, { now: NOW }))).toEqual(['nip85.syntax_invalid', 'proof.invalid'])
  })
})
