import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_GROUP_DECISIONS_PROFILE,
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  aggregateEventContributions,
  contributeAssertion,
  contributeEventAssertion,
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
  verifyAdmissionRequest,
  verifyCircleManifest,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { EventTemplate, UseCaseProfile } from '../../src/index.js'

// A policy inside a signed bundle arrives as JSON, and nothing checked its
// shape. A field of the wrong type made the verifier throw, or switched its
// check off: circle manifests given as null lost a revocation, and a metric
// gate given as a string was no gate.
// Each field the verifier reads must now be absent or of its type, and null is
// not absent. Absent keeps the default it always had, and is malformed only
// where there is none. On a malformed field the verifier reports it under the
// code of the part that owns it, and checks nothing else.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const APPLICANT_KEY = '99'.repeat(32)
const audience = 'relay:wss://relay.example.com'
const MALFORMED = 'The deployment policy is malformed, so this was not checked.'
const FIELD_CODES = new Set(['policy.field_invalid', 'profile.field_invalid', 'circle.manifest_field_invalid'])
const POLICY_CONTROLS = [
  'event-signatures', 'event-publisher', 'circle-policy', 'companion-evidence', 'profile-subject', 'proof-threshold', 'metric-policy',
]

type Member = { priv: string; pub: string }
function member(byte: string): Member {
  const priv = byte.repeat(32)
  return { priv, pub: signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, priv).pubkey }
}
const members = ['11', '22', '33'].map(member)
const outsiders = ['66', '77', '88'].map(member)
const circle = createTrustCircle(members.map(item => item.pub))
const otherCircle = createTrustCircle(outsiders.map(item => item.pub))
const subject = member('99').pub
const userProfile = USER_REPUTATION_ABUSE_REPORTING_PROFILE

function proofFor(
  { c = circle, who = members, s = subject, ranks = [90, 85, 80], extra = {} }:
  { c?: typeof circle; who?: Member[]; s?: string; ranks?: number[]; extra?: Record<string, number> } = {},
): EventTemplate {
  const contributions = ranks.map((rank, index) => contributeAssertion(
    c, s, { rank, ...extra }, who[index].priv, c.members.indexOf(who[index].pub), { proofVersion: 'v2' },
  ))
  return { ...aggregateContributions(c, s, contributions, { proofVersion: 'v2' }), created_at: NOW }
}
const signed = (event: EventTemplate) => signEvent(event, PUBLISHER_KEY)
const good = signed(proofFor())

const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const ABSENT = Symbol('absent')
// JSON can carry an object that cannot be read as text or as a number
const UNPRINTABLE: unknown = JSON.parse('{"toString":1}')

/** A JSON copy of a policy with one field, reached by its path, replaced. */
function patched(policy: unknown, path: ReadonlyArray<string | number>, value: unknown): Record<string, unknown> {
  const copy = clone(policy) as Record<string, unknown>
  let target = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === ABSENT) delete target[last]
  else target[last] = value
  return copy
}

const manifestFields = { issuedAt: NOW - 10, expiresAt: NOW + 600, name: 'Other', profileIds: [userProfile.id], purpose: 'Manifest fields' }
const revoking = createCircleManifest({ ...manifestFields, members: [...otherCircle.members], revokedCircleIds: [circle.circleId] })
const superseding = createCircleManifest({ ...manifestFields, members: [...otherCircle.members], supersedes: [circle.circleId] })
const viaManifest = createCircleManifest({ ...manifestFields, members: [...circle.members] })

const POLICIES = {
  base: createDeploymentPolicy(userProfile, gate),
  revoking: createDeploymentPolicy(userProfile, { ...gate, circleManifests: [revoking], now: NOW }),
  superseding: createDeploymentPolicy(userProfile, { ...gate, circleManifests: [superseding], now: NOW }),
  viaManifest: createDeploymentPolicy(userProfile, { expectedSubject: subject, circleManifests: [viaManifest], now: NOW }),
  evidence: createDeploymentPolicy(userProfile, { ...gate, companionEvidence: [{ id: 'check' }] }),
  gated: createDeploymentPolicy(userProfile, { ...gate, metricPolicies: { rank: { min: 95 } } }),
  requiredMetric: createDeploymentPolicy(userProfile, { ...gate, metricPolicies: { followers: { required: true } } }),
  integerMetric: createDeploymentPolicy(userProfile, { ...gate, metricPolicies: { rank: { integer: true } } }),
  rejectUnknown: createDeploymentPolicy(userProfile, { ...gate, metricPolicies: { rank: {} }, rejectUnknownMetrics: true }),
  signatures: createDeploymentPolicy(userProfile, { ...gate, requireNostrSignature: true }),
}
// Creation refuses a manifest for another profile, so this one is put in by hand
const wrongProfilePolicy = {
  ...clone(createDeploymentPolicy(userProfile, { acceptedCircleIds: [otherCircle.circleId], expectedSubject: subject })),
  circleManifests: [clone(createCircleManifest({ ...manifestFields, members: [...circle.members], profileIds: ['some-other-profile'] }))],
}

// The tally profile bounds each ballot through profile.metrics[].contribution
const motion = 'cd'.repeat(32)
const ballots = [5, 1, 0].map((rank, index) => contributeEventAssertion(
  circle, motion, { rank }, members[index].priv, circle.members.indexOf(members[index].pub), { proofVersion: 'v2' },
))
const stuffed = signed({ ...aggregateEventContributions(circle, motion, ballots, { proofVersion: 'v2', aggregate: 'sum' }), created_at: NOW })
const tally = createDeploymentPolicy(ANONYMOUS_GROUP_DECISIONS_PROFILE, { acceptedCircleIds: [circle.circleId], expectedSubject: motion })

// A federation of two scoped circles that share two members
const fedMembers = ['11', '22', '33', '77'].map(member)
const scope = 'fed.example'
const circleA = createTrustCircle(fedMembers.slice(0, 3).map(item => item.pub), { scope })
const circleB = createTrustCircle(fedMembers.slice(1, 4).map(item => item.pub), { scope })
function fedProof(c: typeof circle, who: Member[], offset: number): EventTemplate {
  const contributions = who.map((item, index) => contributeAssertion(
    c, subject, { rank: offset + index * 5, reports_cnt_recd: index + 1 }, item.priv, c.members.indexOf(item.pub), { proofVersion: 'v2' },
  ))
  return { ...aggregateContributions(c, subject, contributions, { proofVersion: 'v2' }), created_at: NOW }
}
const fedEvents = [signed(fedProof(circleA, fedMembers.slice(0, 3), 30)), signed(fedProof(circleB, fedMembers.slice(1, 4), 35))]
const federation = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
  acceptedCircleIds: [circleA.circleId, circleB.circleId], expectedSubject: subject, minDistinctSigners: 3,
})

interface Row {
  policy: unknown
  path: ReadonlyArray<string | number>
  values: unknown[]
  code: 'policy.field_invalid' | 'profile.field_invalid' | 'circle.manifest_field_invalid'
  /** The path the issue names, where it is not the field's own path. */
  at?: string
  events?: EventTemplate | EventTemplate[]
}

/** Where each field is malformed. Taken from the probe of every field the verifier reads. */
const ROWS: Row[] = [
  { policy: POLICIES.base, path: ['acceptedCircleIds'], values: [{}, 42, null, 'abc', [42], [UNPRINTABLE]], code: 'policy.field_invalid' },
  { policy: POLICIES.revoking, path: ['circleManifests'], values: [null, 'abc', {}, 42], code: 'policy.field_invalid' },
  { policy: POLICIES.evidence, path: ['companionEvidence'], values: [null, 'abc', {}, 42], code: 'policy.field_invalid' },
  { policy: POLICIES.evidence, path: ['companionEvidence', 0], values: [null, 42, 'check', []], code: 'policy.field_invalid', at: 'companionEvidence[0]' },
  { policy: POLICIES.evidence, path: ['companionEvidence', 0, 'id'], values: [ABSENT, null, 42, UNPRINTABLE], code: 'policy.field_invalid', at: 'companionEvidence[0].id' },
  { policy: POLICIES.base, path: ['expectedSubject'], values: [ABSENT, null, {}, 42], code: 'policy.field_invalid' },
  { policy: POLICIES.base, path: ['expectedSubjectTagValue'], values: [null, {}, 42], code: 'policy.field_invalid' },
  { policy: POLICIES.base, path: ['aggregate'], values: [null, 42, {}], code: 'policy.field_invalid' },
  { policy: POLICIES.evidence, path: ['companionEvidence', 0, 'required'], values: [null, 'false', 0], code: 'policy.field_invalid', at: 'companionEvidence[0].required' },
  { policy: POLICIES.evidence, path: ['companionEvidence', 0, 'expectedSubject'], values: [null, 42, {}], code: 'policy.field_invalid', at: 'companionEvidence[0].expectedSubject' },
  { policy: POLICIES.gated, path: ['metricPolicies'], values: [ABSENT, null, 'abc', [], 42], code: 'policy.field_invalid' },
  { policy: POLICIES.gated, path: ['metricPolicies', 'rank'], values: [null, 70, 'abc', []], code: 'policy.field_invalid' },
  { policy: POLICIES.requiredMetric, path: ['metricPolicies', 'followers', 'required'], values: ['true', 1, null], code: 'policy.field_invalid' },
  { policy: POLICIES.integerMetric, path: ['metricPolicies', 'rank', 'integer'], values: ['true', 1, null], code: 'policy.field_invalid' },
  { policy: POLICIES.rejectUnknown, path: ['rejectUnknownMetrics'], values: [0, null, 'true', 1, 'false'], code: 'policy.field_invalid' },
  { policy: POLICIES.signatures, path: ['requireNostrSignature'], values: [0, null, '', 'true', 1], code: 'policy.field_invalid' },
  { policy: POLICIES.superseding, path: ['allowSupersededCircleIds'], values: ['false', 1, 'no', 0, null], code: 'policy.field_invalid' },
  { policy: POLICIES.base, path: ['profile'], values: [ABSENT, null, 'abc', 42, []], code: 'profile.field_invalid' },

  { policy: POLICIES.base, path: ['profile', 'id'], values: [ABSENT, null, 42, UNPRINTABLE], code: 'profile.field_invalid', at: 'profile.id' },
  { policy: POLICIES.base, path: ['profile', 'kind'], values: [ABSENT, null, '30382', UNPRINTABLE], code: 'profile.field_invalid', at: 'profile.kind' },
  { policy: POLICIES.base, path: ['profile', 'proofVersion'], values: [ABSENT, null, 'v3', {}, '', 2, UNPRINTABLE], code: 'profile.field_invalid', at: 'profile.proofVersion' },
  { policy: POLICIES.base, path: ['profile', 'subjectTag'], values: [ABSENT, null, 'x', 42, UNPRINTABLE], code: 'profile.field_invalid', at: 'profile.subjectTag' },
  { policy: POLICIES.base, path: ['profile', 'subjectTagValue'], values: [null, 42, {}], code: 'profile.field_invalid', at: 'profile.subjectTagValue' },
  { policy: POLICIES.base, path: ['profile', 'aggregate'], values: [null, 42, {}], code: 'profile.field_invalid', at: 'profile.aggregate' },
  { policy: POLICIES.base, path: ['profile', 'subjectFormats'], values: [ABSENT, null, 'pubkey', {}, [42], [UNPRINTABLE]], code: 'profile.field_invalid', at: 'profile.subjectFormats' },
  { policy: tally, path: ['profile', 'metrics'], values: [ABSENT, null, 'abc', 42, {}], code: 'profile.field_invalid', at: 'profile.metrics', events: stuffed },
  { policy: tally, path: ['profile', 'metrics', 0], values: [null, 42, 'rank'], code: 'profile.field_invalid', at: 'profile.metrics[0]', events: stuffed },
  { policy: tally, path: ['profile', 'metrics', 0, 'name'], values: [ABSENT, null, 42], code: 'profile.field_invalid', at: 'profile.metrics[0].name', events: stuffed },
  { policy: tally, path: ['profile', 'metrics', 0, 'contribution'], values: [null, 'abc', 42], code: 'profile.field_invalid', at: 'profile.metrics[0].contribution', events: stuffed },
  { policy: federation, path: ['profile', 'federation'], values: [null, 'abc', 42, []], code: 'profile.field_invalid', at: 'profile.federation', events: fedEvents },
  { policy: federation, path: ['profile', 'federation', 'minCircles'], values: [ABSENT, null, 'abc', {}, 0, 2.5, '2'], code: 'profile.field_invalid', at: 'profile.federation.minCircles', events: fedEvents },
  { policy: federation, path: ['profile', 'federation', 'requireScope'], values: [null, 0, '', 'false', 1], code: 'profile.field_invalid', at: 'profile.federation.requireScope', events: fedEvents },

  { policy: POLICIES.revoking, path: ['circleManifests', 0], values: [null, 42, 'abc', []], code: 'circle.manifest_field_invalid', at: 'circleManifests[0]' },
  { policy: POLICIES.revoking, path: ['circleManifests', 0, 'circleId'], values: [ABSENT, null, 42, UNPRINTABLE], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].circleId' },
  { policy: POLICIES.revoking, path: ['circleManifests', 0, 'issuedAt'], values: [ABSENT, null, 'abc', UNPRINTABLE], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].issuedAt' },
  { policy: POLICIES.revoking, path: ['circleManifests', 0, 'name'], values: [ABSENT, null, 42, UNPRINTABLE], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].name' },
  { policy: POLICIES.revoking, path: ['circleManifests', 0, 'revokedCircleIds'], values: [null, {}, 42, 'abc', [42], [UNPRINTABLE]], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].revokedCircleIds' },
  { policy: POLICIES.superseding, path: ['circleManifests', 0, 'supersedes'], values: [null, {}, 42, 'abc', [42]], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].supersedes' },
  { policy: wrongProfilePolicy, path: ['circleManifests', 0, 'profileIds'], values: [ABSENT, null, {}, 42, 'some-other-profile', [42]], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].profileIds' },
  { policy: POLICIES.viaManifest, path: ['circleManifests', 0, 'members'], values: [ABSENT, null, {}, 'abc', [42], [UNPRINTABLE]], code: 'circle.manifest_field_invalid', at: 'circleManifests[0].members', events: signed(proofFor({ c: otherCircle, who: outsiders })) },
]

const CASES = ROWS.flatMap(row => row.values.map(value => ({
  ...row,
  value,
  label: `${row.path.join('.')} = ${value === ABSENT ? '(absent)' : value === UNPRINTABLE ? '{"toString":1}' : JSON.stringify(value)}`,
})))

const challenge = createAdmissionChallenge({ applicantPubkey: subject, audience, expiresAt: NOW + 60, issuedAt: NOW - 10, nonce: 'cd'.repeat(32) })
const presentation = createAdmissionPresentation(challenge, APPLICANT_KEY, { createdAt: NOW })
const bundleOf = (policy: unknown) => createSignedDeploymentBundle(policy as never, {
  expiresAt: NOW + 600, id: 'fields', issuedAt: NOW - 10, privateKey: OPERATOR_KEY,
})
const operator = bundleOf(POLICIES.base).signer

describe('a policy field of the wrong type', () => {
  it.each(CASES)('$label is reported under its owner\'s code, and nothing else is checked', ({ policy, path, value, code, at, events }) => {
    const result = verifyDeploymentPolicy(events ?? good, patched(policy, path, value) as never, { now: NOW })

    expect(result.decision).toBe('reject')
    const issues = result.issues ?? []
    expect(issues).toContainEqual(expect.objectContaining({ code, path: at ?? path.join('.') }))
    expect(issues.every(issue => FIELD_CODES.has(issue.code))).toBe(true)
    expect(result.errors).toEqual(issues.map(issue => issue.message))
  })

  it.each(CASES)('$label stops a production run, which the report shows as not checked', ({ policy, path, value, code, at, events }) => {
    const bundle = bundleOf(patched(policy, path, value))
    const result = verifyProductionDeployment(events ?? good, bundle, { now: NOW, trustedPublishers: [operator] })

    expect(result.decision).toBe('reject')
    const issues = result.deployment.issues ?? []
    expect(issues).toContainEqual(expect.objectContaining({ code, path: at ?? path.join('.') }))
    expect(issues.every(issue => FIELD_CODES.has(issue.code))).toBe(true)
    // Nothing more of the policy is read above it either
    expect(result.issues.every(issue => FIELD_CODES.has(issue.code))).toBe(true)

    const report = createProductionDecisionReport(result)
    for (const id of POLICY_CONTROLS) {
      expect(report.controls.find(item => item.id === id), id).toMatchObject({ status: 'not-checked', summary: MALFORMED })
    }
    // A policy that could not be applied is not described
    expect(report.policyId).toBe('')
    expect(report.subject).toBe('')
    expect(report.profile.id).toBe('')
    expect(report.recommendedAction).toBe('operator-action')

    const admission = verifyAdmissionRequest(events ?? good, bundle, challenge, presentation, {
      expectedAudience: audience, now: NOW, trustedPublishers: [operator],
    })
    expect(admission.decision).toBe('deny')
    expect(admission.errors).toEqual(result.errors)
  })

  // The operator can sign a bundle whose whole policy is the wrong type
  it.each([[null], [42], ['abc'], [[]]])('stops on a policy that is not an object: %j', (policy) => {
    const bundle = bundleOf(policy)
    const result = verifyProductionDeployment(good, bundle, { now: NOW, trustedPublishers: [operator] })
    expect(result.decision).toBe('reject')
    expect(result.deployment.issues).toContainEqual(expect.objectContaining({ code: 'policy.field_invalid', path: 'policy' }))

    const report = createProductionDecisionReport(result)
    for (const id of POLICY_CONTROLS) {
      expect(report.controls.find(item => item.id === id), id).toMatchObject({ status: 'not-checked', summary: MALFORMED })
    }
    const admission = verifyAdmissionRequest(good, bundle, challenge, presentation, {
      expectedAudience: audience, now: NOW, trustedPublishers: [operator],
    })
    expect(admission.decision).toBe('deny')
  })

  // Nor do the production and admission checks read any more of it
  it.each([
    [['requireNostrSignature'], 'true'],
    [['expectedSubject'], 42],
    [[], 42],
  ] as Array<[Array<string | number>, unknown]>)('is read no further by production or admission: %j', (path, value) => {
    const bundle = bundleOf(path.length === 0 ? value : patched(POLICIES.signatures, path, value))
    const result = verifyProductionDeployment(good, bundle, { now: NOW, trustedPublishers: [operator] })
    expect(result.issues.map(issue => issue.code)).toEqual(['policy.field_invalid'])
    expect(createProductionDecisionReport(result).remediations).toHaveLength(1)

    const admission = verifyAdmissionRequest(good, bundle, challenge, presentation, {
      expectedAudience: audience, now: NOW, trustedPublishers: [operator],
    })
    expect(admission.decision).toBe('deny')
    expect(admission.errors).toEqual(result.errors)
  })

  // A verifier that takes a time still reports one it cannot compare
  it('still reports an unusable now beside the field', () => {
    const TIME = 'now must be a Unix timestamp'
    const policyRun = verifyDeploymentPolicy(good, patched(POLICIES.base, ['metricPolicies'], 'abc') as never, { now: Number.NaN })
    expect((policyRun.issues ?? []).map(issue => issue.code)).toEqual(['policy.field_invalid', 'verification.now_invalid'])
    const profileRun = verifyUseCaseProfile(good, { ...userProfile, proofVersion: 'v3' } as never, { ...gate, now: Number.NaN })
    expect((profileRun.issues ?? []).map(issue => issue.code)).toEqual(['profile.field_invalid', 'verification.now_invalid'])
    expect(verifyCircleManifest(patched(revoking, ['supersedes'], 42) as never, { now: Number.NaN }).errors).toContain(TIME)
  })

  // The bundle's own dates are checked before the policy is read, so an
  // unusable now is still reported, and the bundle control still fails for it
  it('is reported beside an unusable now', () => {
    const bundle = bundleOf(patched(POLICIES.base, ['expectedSubject'], ABSENT))
    const result = verifyProductionDeployment(good, bundle, { now: Number.NaN, trustedPublishers: [operator] })
    // Each reported once, though the bundle and the policy each take the time
    expect(result.issues.map(issue => issue.code)).toEqual(['verification.now_invalid', 'policy.field_invalid'])
    const admission = verifyAdmissionRequest(good, bundle, challenge, presentation, {
      expectedAudience: audience, now: Number.NaN, trustedPublishers: [operator],
    })
    expect(admission.errors.filter(error => error === 'now must be a Unix timestamp')).toHaveLength(1)

    const report = createProductionDecisionReport(result)
    expect(report.controls.find(item => item.id === 'bundle-freshness')?.status).toBe('fail')
    for (const id of POLICY_CONTROLS) {
      expect(report.controls.find(item => item.id === id), id).toMatchObject({ status: 'not-checked', summary: MALFORMED })
    }
  })

  // A guard, which holds on the parent too
  it('leaves each well-formed policy as it was', () => {
    for (const row of ROWS) {
      const result = verifyDeploymentPolicy(row.events ?? good, clone(row.policy) as never, { now: NOW })
      expect((result.issues ?? []).filter(issue => FIELD_CODES.has(issue.code)), row.path.join('.')).toEqual([])
    }
  })

  // A policy made by 0.16.0 has no circleManifests and no
  // allowSupersededCircleIds, and an optional field may be left out. A guard,
  // which holds on the parent too
  it.each([
    [POLICIES.revoking, ['circleManifests']],
    [POLICIES.revoking, ['circleManifests', 0, 'revokedCircleIds']],
    [POLICIES.revoking, ['circleManifests', 0, 'expiresAt']],
    [POLICIES.superseding, ['circleManifests', 0, 'supersedes']],
    [POLICIES.superseding, ['allowSupersededCircleIds']],
    [POLICIES.evidence, ['companionEvidence']],
    [POLICIES.rejectUnknown, ['rejectUnknownMetrics']],
    [POLICIES.signatures, ['requireNostrSignature']],
    [POLICIES.base, ['expectedSubjectTagValue']],
    [POLICIES.base, ['profile', 'aggregate']],
    [POLICIES.requiredMetric, ['metricPolicies', 'followers', 'required']],
    [federation, ['profile', 'federation']],
    [tally, ['profile', 'metrics', 0, 'contribution']],
  ] as Array<[unknown, Array<string | number>]>)('keeps the default of an absent field: %#', (policy, path) => {
    const result = verifyDeploymentPolicy(good, patched(policy, path, ABSENT) as never, { now: NOW })
    expect((result.issues ?? []).filter(issue => FIELD_CODES.has(issue.code))).toEqual([])
  })

  // What an absent switch reads as, set against the same switch turned on. A
  // guard, which holds on the parent too: it pins each default against change
  it('reads each absent switch as off', () => {
    const decide = (policy: unknown, event: EventTemplate) => verifyDeploymentPolicy(event, policy as never, { now: NOW })
    const codes = (policy: unknown, event: EventTemplate) => (decide(policy, event).issues ?? []).map(issue => issue.code)

    expect(decide(patched(POLICIES.superseding, ['allowSupersededCircleIds'], ABSENT), good).decision).toBe('reject')
    expect(decide(patched(POLICIES.superseding, ['allowSupersededCircleIds'], true), good).decision).toBe('accept')

    const extra = signed(proofFor({ extra: { followers: 5 } }))
    expect(decide(patched(POLICIES.rejectUnknown, ['rejectUnknownMetrics'], ABSENT), extra).decision).toBe('accept')
    expect(codes(POLICIES.rejectUnknown, extra)).toContain('metric.unknown')

    const unsigned = proofFor()
    expect(decide(patched(POLICIES.signatures, ['requireNostrSignature'], ABSENT), unsigned).decision).toBe('accept')
    expect(decide(POLICIES.signatures, unsigned).decision).toBe('reject')

    expect(decide(patched(POLICIES.requiredMetric, ['metricPolicies', 'followers', 'required'], ABSENT), good).decision).toBe('accept')
    expect(codes(POLICIES.requiredMetric, good)).toContain('metric.required_missing')
  })

  // A value of the right type with a check of its own is left to that check.
  // A guard, which holds on the parent too
  it('leaves a value of its type to its own check', () => {
    const codes = (path: Array<string | number>, value: unknown) =>
      (verifyDeploymentPolicy(good, patched(POLICIES.base, path, value) as never, { now: NOW }).issues ?? []).map(issue => issue.code)
    expect(codes(['aggregate'], 'max')).toContain('proof.aggregate_mismatch')
    expect(codes(['maxAgeSeconds'], 'abc')).toEqual(['policy.max_age_seconds_invalid'])
    expect(codes(['acceptedPublishers'], [])).toContain('policy.accepted_publishers_invalid')
    for (const [path, value] of [[['aggregate'], 'max'], [['maxAgeSeconds'], 'abc'], [['acceptedPublishers'], []]] as Array<[string[], unknown]>) {
      expect(codes(path, value).filter(code => FIELD_CODES.has(code)), path.join('.')).toEqual([])
    }
  })

  // A guard, which holds on the parent too
  it('treats an empty list as a list', () => {
    for (const [policy, path] of [
      [POLICIES.base, ['circleManifests']], [POLICIES.base, ['acceptedCircleIds']], [tally, ['profile', 'metrics']],
    ] as Array<[unknown, Array<string | number>]>) {
      const result = verifyDeploymentPolicy(good, patched(policy, path, []) as never, { now: NOW })
      expect((result.issues ?? []).filter(issue => FIELD_CODES.has(issue.code)), path.join('.')).toEqual([])
    }
  })

  it('has an explanation for each new code that sends the operator to the policy', () => {
    for (const code of FIELD_CODES) {
      expect(explainVerificationIssue(code as never).action).toBe('operator-action')
    }
  })
})

describe('a profile field of the wrong type, verified on its own', () => {
  it.each([
    ['proofVersion', ABSENT],
    ['subjectFormats', 'pubkey'],
    ['metrics', null],
    ['federation', 42],
  ] as Array<[string, unknown]>)('%s is reported as a profile field, not thrown', (field, value) => {
    const profile = patched(userProfile, [field], value) as unknown as UseCaseProfile
    const result = verifyUseCaseProfile(good, profile, { ...gate, now: NOW })

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'profile.field_invalid', path: `profile.${field}` }))
    expect(result.events).toEqual([])
  })

  it('is reported when the profile is not an object', () => {
    const result = verifyUseCaseProfile(good, 42 as unknown as UseCaseProfile, { ...gate, now: NOW })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'profile.field_invalid', path: 'profile' }))
  })
})

describe('a circle manifest field of the wrong type, verified on its own', () => {
  it.each([
    ['members', null],
    ['profileIds', 'abc'],
    ['revokedCircleIds', {}],
    ['supersedes', 42],
  ] as Array<[string, unknown]>)('%s is an error, not a throw', (field, value) => {
    const result = verifyCircleManifest(patched(revoking, [field], value) as never, { now: NOW })
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.includes(field))).toBe(true)
  })

  it('still gives the circle id the manifest states, where it is well formed', () => {
    const result = verifyCircleManifest(patched(revoking, ['members'], [42]) as never, { now: NOW })
    expect(result.valid).toBe(false)
    expect(result.circleId).toBe(revoking.circleId)
  })

  // A set with a malformed manifest accepts no circle, but a revocation or a
  // supersession that a well-formed manifest beside it states still stands
  it('accepts nothing from a set that holds one, and keeps what the others revoke', () => {
    const both = createCircleManifest({ ...manifestFields, members: [...otherCircle.members], revokedCircleIds: [circle.circleId], supersedes: ['cd'.repeat(32)] })
    const result = resolveCircleManifests([both, patched(viaManifest, ['members'], null) as never], { now: NOW })
    expect(result.valid).toBe(false)
    expect(result.acceptedCircleIds).toEqual([])
    expect(result.revokedCircleIds).toEqual([circle.circleId])
    expect(result.supersededCircleIds).toEqual(['cd'.repeat(32)])
    expect(result.errors).toEqual(['manifest[1].members must be a list of strings'])
  })

  it('still reports an unusable now when the set itself is not a list', () => {
    for (const value of ['abc', null, {}]) {
      expect(resolveCircleManifests(value as never, { now: Number.NaN }).errors, JSON.stringify(value))
        .toEqual(['manifests must be a list', 'now must be a Unix timestamp'])
    }
  })

  it('is an error when the manifest is not an object', () => {
    expect(verifyCircleManifest(null as never, { now: NOW }).valid).toBe(false)
    expect(verifyCircleManifest(42 as never, { now: NOW }).valid).toBe(false)
  })
})

describe('creating a policy', () => {
  // Read as unset and never stored: a stored null would be rejected by the
  // verifier as a malformed field
  it.each([
    ['expectedSubjectTagValue', { expectedSubjectTagValue: null }],
    ['acceptedCircleIds beside a manifest', { acceptedCircleIds: null, circleManifests: [viaManifest], now: NOW }],
    ['a companion requirement label', { companionEvidence: [{ id: 'check', label: null }] }],
    ['a companion requirement subject', { companionEvidence: [{ id: 'check', expectedSubject: null }] }],
    ['a companion requirement', { companionEvidence: [null, { id: 'check' }] }],
    ['a metric entry', { metricPolicies: { rank: null } }],
    ['a metric entry\'s required', { metricPolicies: { rank: { required: null } } }],
    ['a metric entry\'s integer', { metricPolicies: { rank: { integer: null } } }],
  ] as Array<[string, Record<string, unknown>]>)('reads a null %s as unset and stores no null', (_label, options) => {
    const policy = createDeploymentPolicy(userProfile, { ...gate, ...options } as never)
    expect(JSON.stringify(policy)).not.toContain('null')
    expect((verifyDeploymentPolicy(good, clone(policy), { now: NOW }).issues ?? []).filter(issue => FIELD_CODES.has(issue.code))).toEqual([])
  })

  it('refuses a null that leaves out what a policy needs, with its own message', () => {
    expect(() => createDeploymentPolicy(userProfile, { ...gate, expectedSubject: null as never })).toThrow('expectedSubject must be')
    expect(() => createDeploymentPolicy(userProfile, { ...gate, companionEvidence: [{ id: null as never }] })).toThrow('companionEvidence[0].id must be')
  })

  // A guard, which holds on the parent too
  it('still refuses a null allowance or metric bound', () => {
    expect(() => createDeploymentPolicy(userProfile, { ...gate, maxFutureSeconds: null as never })).toThrow('maxFutureSeconds')
    expect(() => createDeploymentPolicy(userProfile, { ...gate, metricPolicies: { rank: { min: null as never } } })).toThrow('min')
  })

  it('refuses a profile whose fields are of the wrong type', () => {
    expect(() => createDeploymentPolicy({ ...userProfile, proofVersion: undefined } as never, gate)).toThrow('profile.proofVersion')
    expect(() => createDeploymentPolicy({ ...userProfile, subjectFormats: 'pubkey' } as never, gate)).toThrow('profile.subjectFormats')
    // A null in the profile is not an option to read as unset: the verifier would reject it
    expect(() => createDeploymentPolicy({ ...userProfile, aggregate: null } as never, gate)).toThrow('profile.aggregate')
  })
})

// Every place in three policies that between them use each part of a policy,
// given an object that cannot be read as text or as a number. Each verifier
// that reads the policy, and the report, must return.
describe('an unconvertible object anywhere in an authentic policy', () => {
  type Place = Array<string | number>
  function places(value: unknown, at: Place = []): Place[] {
    const found: Place[] = [at]
    if (Array.isArray(value)) value.forEach((child, index) => found.push(...places(child, [...at, index])))
    else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) found.push(...places(child, [...at, key]))
    }
    return found
  }
  const everything = createDeploymentPolicy(userProfile, {
    ...gate,
    acceptedPublishers: [member('55').pub],
    circleManifests: [viaManifest],
    companionEvidence: [{ id: 'check', maxAgeSeconds: 300 }],
    metricPolicies: { rank: { required: true, min: 0, max: 100, integer: true } },
    now: NOW,
    requireNostrSignature: true,
  })

  // Only that nothing throws is asked here, so each federation event carries
  // one signature rather than three
  const quickFedEvents = [
    signed(fedProof(circleA, fedMembers.slice(0, 1), 30)),
    signed(fedProof(circleB, fedMembers.slice(1, 2), 35)),
  ]

  it.each([
    ['everything', everything, good],
    ['federation', federation, quickFedEvents],
    ['tally', tally, stuffed],
  ] as Array<[string, unknown, EventTemplate | EventTemplate[]]>)('makes no verifier throw: %s', (_name, policy, events) => {
    const threw: string[] = []
    for (const place of places(clone(policy)).filter(item => item.length > 0)) {
      const bundle = bundleOf(patched(policy, place, UNPRINTABLE))
      const options = { companionEvidence: [{ id: 'check', status: 'pass' as const, checkedAt: NOW }], now: NOW, trustedPublishers: [operator] }
      try {
        createProductionDecisionReport(verifyProductionDeployment(events, bundle, options))
        verifyAdmissionRequest(events, bundle, challenge, presentation, { ...options, expectedAudience: audience })
      } catch (error) {
        threw.push(`${place.join('.')}: ${(error as Error).message}`)
      }
    }
    expect(threw).toEqual([])
  })
})

// A metric's name is the operator's to choose, and an event names its metric
// tags. A name every object already has, such as constructor, is still a name.
describe('a metric named after a member every object has', () => {
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])('is gated like any other: %s', (name) => {
    const policy = createDeploymentPolicy(userProfile, { ...gate, metricPolicies: { [name]: { required: true, max: 10 } } })
    const event = signed(proofFor({ extra: { [name]: 5 } }))

    const result = verifyDeploymentPolicy(event, clone(policy), { now: NOW })
    expect(Object.hasOwn(result.metrics, name)).toBe(true)
    expect(result.metrics[name]).toEqual([5])
    expect((result.issues ?? []).map(issue => issue.code)).not.toContain('metric.required_missing')

    const over = verifyDeploymentPolicy(signed(proofFor({ extra: { [name]: 50 } })), clone(policy), { now: NOW })
    expect((over.issues ?? []).map(issue => issue.code)).toContain('metric.above_max')

    const production = verifyProductionDeployment(event, bundleOf(policy), { now: NOW, trustedPublishers: [operator] })
    expect(() => createProductionDecisionReport(production)).not.toThrow()
  })
})
