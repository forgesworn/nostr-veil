import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  ANONYMOUS_GROUP_DECISIONS_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  USE_CASE_PROFILES,
  aggregateContributions,
  aggregateEventContributions,
  contributeAssertion,
  contributeEventAssertion,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  createTrustCircle,
  signEvent,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifySignedDeploymentBundle,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { AggregateName, EventTemplate, UseCaseProfile } from '../../src/index.js'

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)

const members = ['11', '22', '33'].map(byte => {
  const priv = byte.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})
const circle = createTrustCircle(members.map(member => member.pub))
const subject = 'dd'.repeat(32)
const motion = 'cd'.repeat(32)

const reputation = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const decisions = ANONYMOUS_GROUP_DECISIONS_PROFILE
const reputationOptions = { acceptedCircleIds: [circle.circleId], expectedSubject: subject, now: NOW }
const decisionOptions = { acceptedCircleIds: [circle.circleId], expectedSubject: motion, now: NOW }

/** Three reviewers score one account. */
function scores(ranks: number[], aggregate: AggregateName = 'median'): EventTemplate {
  const contributions = ranks.map((rank, index) => contributeAssertion(
    circle,
    subject,
    { rank },
    members[index].priv,
    circle.members.indexOf(members[index].pub),
    { proofVersion: 'v2' },
  ))
  return { ...aggregateContributions(circle, subject, contributions, { aggregate }), created_at: NOW }
}

/** Three members vote on one motion. */
function tally(ballots: number[], aggregate: AggregateName = 'sum'): EventTemplate {
  const contributions = ballots.map((rank, index) => contributeEventAssertion(
    circle,
    motion,
    { rank },
    members[index].priv,
    circle.members.indexOf(members[index].pub),
  ))
  return { ...aggregateEventContributions(circle, motion, contributions, { aggregate }), created_at: NOW }
}

describe('profiles pin the aggregate function', () => {
  it('names the aggregate for every built-in profile', () => {
    for (const profile of USE_CASE_PROFILES) {
      expect(profile.aggregate, profile.id).toBe(profile.id === 'anonymous-group-decisions' ? 'sum' : 'median')
    }
  })

  it('rejects a sound proof republished under another aggregate function', () => {
    expect(verifyUseCaseProfile(scores([20, 20, 95]), reputation, reputationOptions).valid).toBe(true)

    const result = verifyUseCaseProfile(scores([20, 20, 95], 'max'), reputation, reputationOptions)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['event[0] proof: veil-agg is "max" but "median" is required'])
    expect(result.issues?.map(issue => issue.code)).toEqual(['proof.aggregate_mismatch'])
    expect(result.events[0].proof.distinctSigners).toBe(3)
  })

  it('lets a deployment choose another aggregate explicitly', () => {
    const options = { ...reputationOptions, aggregate: 'max' as const }
    expect(verifyUseCaseProfile(scores([20, 20, 95], 'max'), reputation, options).valid).toBe(true)
    expect(verifyUseCaseProfile(scores([20, 20, 95]), reputation, options).valid).toBe(false)
  })

  it('holds the pin when the verifier is also given an aggregate function', () => {
    // The same scores published as a custom max, with the veil-agg tag removed
    const max = (values: number[]) => Math.max(...values)
    const contributions = [20, 20, 95].map((rank, index) => contributeAssertion(
      circle,
      subject,
      { rank },
      members[index].priv,
      circle.members.indexOf(members[index].pub),
      { proofVersion: 'v2' },
    ))
    const tagless: EventTemplate = { ...aggregateContributions(circle, subject, contributions, max), created_at: NOW }
    tagless.tags = tagless.tags.filter(tag => tag[0] !== 'veil-agg')

    const result = verifyUseCaseProfile(tagless, reputation, { ...reputationOptions, aggregateFn: max })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'event[0] proof: Published metric "rank" (95) does not match signed contributions (20)',
    )
  })

  it('does not pin a custom profile that leaves the aggregate unset', () => {
    const unpinned: UseCaseProfile = { ...reputation, aggregate: undefined }
    expect(verifyUseCaseProfile(scores([20, 20, 95], 'max'), unpinned, reputationOptions).valid).toBe(true)
  })
})

describe('anonymous tally profile', () => {
  it('accepts a sum of ballots that are each 0 or 1', () => {
    const result = verifyUseCaseProfile(tally([1, 1, 0]), decisions, decisionOptions)
    expect(result.valid, result.errors.join('; ')).toBe(true)
  })

  it('rejects a ballot worth more than one', () => {
    const result = verifyUseCaseProfile(tally([1, 0, 3]), decisions, decisionOptions)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'event[0] proof: Signature at index 2 metric "rank" value 3 is above the contribution maximum 1',
    )
    expect(result.issues?.map(issue => issue.code)).toContain('proof.contribution_out_of_bounds')
  })

  it('rejects a signer who cast no ballot', () => {
    const metrics = [{ rank: 1 }, { rank: 1 }, { comment_cnt: 1 }]
    const contributions = metrics.map((ballot, index) => contributeEventAssertion(
      circle,
      motion,
      ballot,
      members[index].priv,
      circle.members.indexOf(members[index].pub),
      { proofVersion: 'v2' },
    ))
    const event = {
      ...aggregateEventContributions(circle, motion, contributions, { aggregate: 'sum', proofVersion: 'v2' }),
      created_at: NOW,
    }
    const result = verifyUseCaseProfile(event, decisions, decisionOptions)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'event[0] proof: Signature at index 2 metric "rank" is missing, as the contribution bounds require',
    )
    expect(result.issues?.map(issue => issue.code)).toContain('proof.contribution_out_of_bounds')
  })

  it('rejects the same ballots published under any aggregate but sum', () => {
    for (const aggregate of ['min', 'max', 'median', 'mean'] as const) {
      const result = verifyUseCaseProfile(tally([1, 1, 0], aggregate), decisions, decisionOptions)
      expect(result.valid, aggregate).toBe(false)
      expect(result.errors, aggregate).toContain(`event[0] proof: veil-agg is "${aggregate}" but "sum" is required`)
    }
  })

  it('lets verifier options replace the bound for a metric', () => {
    const wider = { rank: { min: 0, max: 5, integer: true } }
    const result = verifyUseCaseProfile(tally([1, 0, 3]), decisions, { ...decisionOptions, contributionBounds: wider })
    expect(result.valid, result.errors.join('; ')).toBe(true)
  })
})

describe('deployment policy aggregate and contribution bounds', () => {
  const base = { acceptedCircleIds: [circle.circleId], expectedSubject: subject }

  it('rejects the max swap that would otherwise pass a score gate', () => {
    const policy = createDeploymentPolicy(reputation, {
      ...base,
      metricPolicies: { rank: { required: true, min: 70 } },
    })
    const result = verifyDeploymentPolicy(scores([20, 20, 95], 'max'), policy, { now: NOW })

    expect(result.metrics.rank).toEqual([95])
    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual(['event[0] proof: veil-agg is "max" but "median" is required'])
  })

  it('carries an explicit aggregate and contribution bounds', () => {
    const policy = createDeploymentPolicy(reputation, {
      ...base,
      aggregate: 'mean',
      contributionBounds: { rank: { min: 0, max: 100 } },
    })

    expect(policy.aggregate).toBe('mean')
    expect(policy.contributionBounds).toEqual({ rank: { min: 0, max: 100 } })
    expect(Object.isFrozen(policy.contributionBounds)).toBe(true)

    expect(verifyDeploymentPolicy(scores([20, 20, 95], 'mean'), policy, { now: NOW }).valid).toBe(true)
    expect(verifyDeploymentPolicy(scores([20, 20, 95]), policy, { now: NOW }).errors)
      .toContain('event[0] proof: veil-agg is "median" but "mean" is required')
    expect(verifyDeploymentPolicy(scores([20, 20, 500], 'mean'), policy, { now: NOW }).errors)
      .toContain('event[0] proof: Signature at index 2 metric "rank" value 500 is above the contribution maximum 100')
  })

  it('leaves both fields off a policy that does not set them', () => {
    const policy = createDeploymentPolicy(reputation, base)
    expect('aggregate' in policy).toBe(false)
    expect('contributionBounds' in policy).toBe(false)
  })

  it('refuses to create a policy with a malformed aggregate or bounds', () => {
    expect(() => createDeploymentPolicy(reputation, { ...base, aggregate: 'mode' as never }))
      .toThrow('aggregate must be one of median, mean, sum, min, max or custom')
    expect(() => createDeploymentPolicy(reputation, { ...base, contributionBounds: { rank: { min: 2, max: 1 } } }))
      .toThrow('contributionBounds.rank.min must be <= max')
  })

  it('fails closed on a hand-built policy with malformed bounds', () => {
    const policy = { ...createDeploymentPolicy(reputation, base), contributionBounds: { rank: { min: 2, max: 1 } } }
    const result = verifyDeploymentPolicy(scores([20, 20, 95]), policy, { now: NOW })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('event[0] proof: contributionBounds.rank.min must be <= max')
  })
})

describe('signed bundle aggregate and contribution bounds', () => {
  const policy = createDeploymentPolicy(decisions, {
    acceptedCircleIds: [circle.circleId],
    expectedSubject: motion,
    requireNostrSignature: true,
  })
  const bundle = createSignedDeploymentBundle(policy, {
    expiresAt: NOW + 600,
    id: 'motion-1',
    issuedAt: NOW,
    privateKey: OPERATOR_KEY,
  })
  const options = { now: NOW, trustedPublishers: [bundle.signer] }

  it('enforces the profile tally rules through the production verifier', () => {
    const accepted = verifyProductionDeployment([signEvent(tally([1, 1, 0]), PUBLISHER_KEY)], bundle, options)
    expect(accepted.decision, accepted.errors.join('; ')).toBe('accept')

    const stuffed = verifyProductionDeployment([signEvent(tally([1, 0, 3]), PUBLISHER_KEY)], bundle, options)
    expect(stuffed.decision).toBe('reject')
    expect(stuffed.issues.map(issue => issue.code)).toContain('proof.contribution_out_of_bounds')

    const asMax = verifyProductionDeployment([signEvent(tally([1, 1, 0], 'max'), PUBLISHER_KEY)], bundle, options)
    expect(asMax.decision).toBe('reject')
    expect(asMax.issues.map(issue => issue.code)).toContain('proof.aggregate_mismatch')
  })

  it('carries the required flag on the ballot bound through the signed bundle', () => {
    expect(bundle.policy.profile.metrics.find(metric => metric.name === 'rank')?.contribution)
      .toEqual({ min: 0, max: 1, integer: true, required: true })

    const explicit = createSignedDeploymentBundle(
      createDeploymentPolicy(decisions, {
        acceptedCircleIds: [circle.circleId],
        expectedSubject: motion,
        contributionBounds: { rank: { min: 0, max: 1, required: true } },
      }),
      { expiresAt: NOW + 600, id: 'motion-2', issuedAt: NOW, privateKey: OPERATOR_KEY },
    )
    const roundTripped = JSON.parse(JSON.stringify(explicit)) as typeof explicit
    expect(roundTripped.policy.contributionBounds).toEqual({ rank: { min: 0, max: 1, required: true } })
    expect(verifySignedDeploymentBundle(roundTripped, { now: NOW, trustedPublishers: [explicit.signer] }).valid).toBe(true)
  })

  it('signs the pinned aggregate and the bounds with the rest of the policy', () => {
    const loosened = {
      ...bundle,
      policy: { ...bundle.policy, profile: { ...bundle.policy.profile, aggregate: 'max' as const } },
    }
    expect(verifySignedDeploymentBundle(bundle, options).valid).toBe(true)
    expect(verifySignedDeploymentBundle(loosened, options).errors).toContain('bundle signature is invalid')
  })
})
