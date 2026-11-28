import { describe, expect, it } from 'vitest'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  computeCircleId,
  contributeAssertion,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  classifyVerificationError,
  explainVerificationIssue,
  signEvent,
  verifyAdmissionRequest,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { EventTemplate, VerificationIssue } from '../../src/index.js'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'

// The limits on an event's tags, tag names and subject, as every verifier
// above the proof applies them. An event over one is turned away with one
// issue before any check reads its tags, so nothing in it is quoted or counted.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const APPLICANT_KEY = '77'.repeat(32)
const audience = 'relay:wss://relay.example.com'

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}

const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const subject = pubkey(APPLICANT_KEY)
const assertion: EventTemplate = {
  ...aggregateContributions(circle, subject, [contributeAssertion(
    circle,
    subject,
    { rank: 85 },
    members[0].priv,
    circle.members.indexOf(members[0].pub),
    { proofVersion: 'v2' },
  )], { proofVersion: 'v2' }),
  created_at: NOW,
}
const gate = { acceptedCircleIds: [circle.circleId], minDistinctSigners: 1, now: NOW }

/** The assertion with filler tags up to `count` tags in all */
function withTags(count: number, filler: (index: number) => string[] = () => ['t', 'x']): EventTemplate {
  return { ...assertion, tags: [...assertion.tags, ...Array.from({ length: count - assertion.tags.length }, (_, index) => filler(index))] }
}
const withSubject = (value: string): EventTemplate =>
  ({ ...assertion, tags: assertion.tags.map(tag => (tag[0] === 'd' ? ['d', value] : tag)) })
const codes = (result: { issues?: VerificationIssue[] }): string[] => (result.issues ?? []).map(issue => issue.code)

const OVER_LIMIT = 'An assertion is over the verifier\'s limits on its tags, tag names or subject, so it was turned away and this was not checked.'
const LIMITS_INVALID = 'A limit given to the verifier is not a non-negative number, so this was not checked for any assertion.'

describe('an event over a limit, in the profile verifier', () => {
  it.each([
    ['too many tags', withTags(1_201), 'event[0] has 1201 tags, more than the limit of 1200'],
    ['a tag name too long', { ...assertion, tags: [...assertion.tags, ['n'.repeat(65), '1']] }, 'event[0] has a tag name longer than 64 characters'],
    // Not a pubkey, so the subject format check would fail it, had it run
    ['a subject too long', withSubject('a'.repeat(513)), 'event[0] has a d tag longer than 512 characters'],
  ])('is turned away with one issue, and nothing else is read: %s', (_name, event, message) => {
    const result = verifyUseCaseProfile(event, profile, gate)

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([{ code: 'event.limit_exceeded', message, path: 'event[0]' }])
    expect(result.errors).toEqual([message])
    expect(result.events).toHaveLength(1)
    expect(result.events[0].event).toBe(event)
    expect(result.events[0].proof.valid).toBe(false)
    expect(result.events[0].syntax.valid).toBe(false)
    expect(result.events[0].subject).toBeNull()
    expect(result.events[0].circleId).toBeNull()
  })

  it('reads the event as before under limits that allow it', () => {
    const result = verifyUseCaseProfile(withTags(1_201), profile, { ...gate, limits: { maxTagCount: 2_000 } })

    expect(codes(result)).not.toContain('event.limit_exceeded')
    expect(codes(result)).toContain('nip85.syntax_invalid')
    expect(verifyUseCaseProfile(assertion, profile, { ...gate, limits: { maxTagCount: 2_000 } }).valid).toBe(true)
  })

  it('applies the limits to a sound event without changing its result', () => {
    expect(verifyUseCaseProfile(assertion, profile, gate).valid).toBe(true)
  })

  it.each([
    ['maxTagCount', Number.NaN],
    ['maxSubjectLength', 'long'],
    ['maxRingSize', -1],
  ] as const)('fails the run closed and reads no event for a limit that is not one: %s of %s', (field, value) => {
    const result = verifyUseCaseProfile(assertion, profile, { ...gate, limits: { [field]: value } as never })

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([{
      code: 'verification.limits_invalid',
      message: `limits.${field} must be a non-negative number`,
    }])
    expect(result.events).toHaveLength(1)
    expect(result.events[0].proof.valid).toBe(false)
  })
})

describe('a federation under the limits', () => {
  const circleOf = (event: EventTemplate): string =>
    computeCircleId(event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1) ?? [])
  // Tags whose names begin veil- and which no proof uses are passed over by
  // the proof, so these events still verify, with more tags than the default
  const padded = moderationEvents.map(event => ({
    ...event,
    tags: [...event.tags.map(tag => [...tag]), ...Array.from({ length: 1_300 }, () => ['veil-x', 'padding'])],
  }))
  const federationGate = {
    acceptedCircleIds: moderationEvents.map(circleOf),
    now: Math.max(...moderationEvents.map(event => event.created_at ?? 0)),
  }

  it('turns away each event over the limit', () => {
    const result = verifyUseCaseProfile(padded, FEDERATED_MODERATION_PROFILE, federationGate)

    expect(result.valid).toBe(false)
    expect((result.issues ?? []).filter(issue => issue.code === 'event.limit_exceeded').map(issue => issue.path))
      .toEqual(['event[0]', 'event[1]'])
  })

  it('reads no tag of an event over the limit, not even its scope', () => {
    const unscoped = [{ ...padded[0], tags: padded[0].tags.filter(tag => tag[0] !== 'veil-scope') }, padded[1]]
    const result = verifyUseCaseProfile(unscoped, FEDERATED_MODERATION_PROFILE, federationGate)

    expect((result.issues ?? []).filter(issue => issue.path === 'event[0]').map(issue => issue.code)).toEqual(['event.limit_exceeded'])
  })

  it('checks the federation under the same limits as each event', () => {
    const result = verifyUseCaseProfile(padded, FEDERATED_MODERATION_PROFILE, { ...federationGate, limits: { maxTagCount: 2_000 } })

    expect(result.valid, result.errors.join('; ')).toBe(true)
    expect(result.federation?.valid).toBe(true)
  })
})

describe('the deployment policy verifier', () => {
  const closed = createDeploymentPolicy(profile, {
    acceptedCircleIds: [circle.circleId],
    expectedSubject: subject,
    metricPolicies: { rank: {} },
    minDistinctSigners: 1,
    rejectUnknownMetrics: true,
  })
  // 1,300 metric names the policy does not allow
  const named = withTags(1_300 + assertion.tags.length, index => [`m${index}`, '1'])

  it('reads no metric of an event over a limit', () => {
    const result = verifyDeploymentPolicy(named, closed, { now: NOW })

    expect(codes(result).filter(code => code === 'metric.unknown')).toHaveLength(0)
    expect(codes(result)).toContain('event.limit_exceeded')
  })

  it('passes its limits to the profile verifier and reads the metrics under them', () => {
    const result = verifyDeploymentPolicy(named, closed, { now: NOW, limits: { maxTagCount: 2_000 } })

    expect(codes(result)).not.toContain('event.limit_exceeded')
    expect(codes(result).filter(code => code === 'metric.unknown')).toHaveLength(1_300)
  })

  it('reads no metric of any event under a limit that is not one', () => {
    expect(codes(verifyDeploymentPolicy(named, closed, { now: NOW, limits: { maxTagCount: -1 } })))
      .toEqual(['verification.limits_invalid'])
  })
})

describe('the production report', () => {
  const policy = createDeploymentPolicy(profile, {
    acceptedCircleIds: [circle.circleId],
    acceptedPublishers: [pubkey(PUBLISHER_KEY)],
    expectedSubject: subject,
    minDistinctSigners: 1,
    requireNostrSignature: true,
  })
  const bundle = createSignedDeploymentBundle(policy, {
    expiresAt: NOW + 600,
    id: 'limits',
    issuedAt: NOW - 10,
    privateKey: OPERATOR_KEY,
  })
  const trusted = { now: NOW, trustedPublishers: [bundle.signer] }
  const EVENT_READ_CONTROLS = ['circle-policy', 'profile-subject', 'proof-threshold', 'metric-policy']
  const controls = (event: EventTemplate, options: object = {}) => {
    const production = verifyProductionDeployment(signEvent(event, PUBLISHER_KEY), bundle, { ...trusted, ...options })
    const report = createProductionDecisionReport(production)
    return { production, status: Object.fromEntries(report.controls.map(item => [item.id, [item.status, item.summary]])) }
  }

  it('passes every control for a sound event', () => {
    const { production, status } = controls(assertion)

    expect(production.decision).toBe('accept')
    for (const id of EVENT_READ_CONTROLS) expect(status[id][0]).toBe('pass')
  })

  it.each([
    ['too many tags', withTags(1_201)],
    ['a tag name too long', { ...assertion, tags: [...assertion.tags, ['n'.repeat(65), '1']] }],
    ['a subject too long', withSubject('a'.repeat(513))],
  ])('fails each control that reads an event over a limit, and says why: %s', (_name, event) => {
    const { production, status } = controls(event)

    expect(production.decision).toBe('reject')
    expect(codes(production)).toContain('event.limit_exceeded')
    for (const id of EVENT_READ_CONTROLS) expect(status[id], id).toEqual(['fail', OVER_LIMIT])
    // The Nostr signature and its publisher are checked on the event as given
    expect(status['event-signatures'][0]).toBe('pass')
    expect(status['event-publisher'][0]).toBe('pass')
  })

  it('fails each control that reads an event under a limit that is not one, and says why', () => {
    const { production, status } = controls(assertion, { limits: { maxTagCount: 'many' } })

    expect(production.decision).toBe('reject')
    expect(codes(production)).toContain('verification.limits_invalid')
    for (const id of EVENT_READ_CONTROLS) expect(status[id], id).toEqual(['fail', LIMITS_INVALID])
    expect(status['event-signatures'][0]).toBe('pass')
  })

  it('passes its limits down from an admission request', () => {
    const challenge = createAdmissionChallenge({
      applicantPubkey: subject,
      audience,
      expiresAt: NOW + 60,
      issuedAt: NOW - 10,
      nonce: 'cd'.repeat(32),
    })
    const presentation = createAdmissionPresentation(challenge, APPLICANT_KEY, { createdAt: NOW })
    const admit = (limits?: object) => verifyAdmissionRequest(
      signEvent(assertion, PUBLISHER_KEY),
      bundle,
      challenge,
      presentation,
      { ...trusted, expectedAudience: audience, ...(limits === undefined ? {} : { limits }) },
    )

    // A rank of 85 alone is sent to manual review, not denied
    expect(admit().decision).toBe('manual-review')
    expect(codes(admit().deployment)).toEqual([])
    const limited = admit({ maxTagCount: 5 })
    expect(limited.decision).toBe('deny')
    expect(codes(limited.deployment)).toContain('event.limit_exceeded')
  })
})

describe('the messages of the limit codes, read as text', () => {
  // For a string with no issue, such as an old log. A limit can be any
  // non-negative number, so the message gives it as JavaScript writes it.
  it.each([1_200, 1_200.5, 1e-9, 1.5e-7])('reads the code back from the message under a limit of %s', (maxTagCount) => {
    const result = verifyUseCaseProfile(withTags(1_201), profile, { ...gate, limits: { maxTagCount } })
    const issue = (result.issues ?? [])[0]

    expect(issue.code).toBe('event.limit_exceeded')
    expect(classifyVerificationError(issue.message).code).toBe('event.limit_exceeded')
  })
})

describe('the explanations of the limit codes', () => {
  it('rejects an event over a limit, and asks the operator to correct a limit that is not one', () => {
    expect(explainVerificationIssue('event.limit_exceeded').action).toBe('reject')
    expect(explainVerificationIssue('verification.limits_invalid').action).toBe('operator-action')
  })
})
