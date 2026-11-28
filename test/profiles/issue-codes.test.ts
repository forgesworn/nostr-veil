import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  VERIFICATION_ISSUE_EXPLANATIONS,
  aggregateContributions,
  classifyVerificationError,
  contributeAssertion,
  createCircleManifest,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  signEvent,
  verifyDeploymentBundle,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifyUseCaseProfile,
} from '../../src/index.js'
import { CodedErrors, issuesOf } from '../../src/profiles/coded.js'
import type {
  CircleManifest,
  EventTemplate,
  SignedEvent,
  UseCaseDeploymentPolicy,
  VerificationIssue,
} from '../../src/index.js'

// An issue code decides which control of the decision report fails and what
// the operator is told to do. The messages behind the codes quote text from
// the event: a tag name, a tag value, a kind. A code read back out of such a
// message can be chosen by whoever wrote the event. Each code is therefore
// given where its error is raised, and nothing here may change one.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}

const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const subject = 'dd'.repeat(32)
// One signer under a threshold of one: the tables below verify this proof many times
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
const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject, minDistinctSigners: 1 }
const policy = createDeploymentPolicy(profile, { ...gate, requireNostrSignature: true })
const signedBy = (from: UseCaseDeploymentPolicy) => createSignedDeploymentBundle(from, {
  expiresAt: NOW + 600,
  id: 'issue-codes',
  issuedAt: NOW - 10,
  privateKey: OPERATOR_KEY,
})
const bundle = signedBy(policy)
const trusted = { now: NOW, trustedPublishers: [bundle.signer] }

/**
 * Text to put where an event or a policy can put text: the library's own
 * messages, one or more for every code a message has ever been read as.
 */
const MESSAGES: string[] = [
  'event[0] assertion created_at is in the future',
  'event[0] assertion created_at is not a Unix timestamp',
  'event[0] missing created_at for freshness check',
  'event[0] assertion is outside the accepted freshness window',
  'bundle is expired',
  'bundle expiresAt must be a non-negative Unix timestamp',
  'production verifier requires bundle.expiresAt',
  'bundle id must be non-empty',
  'bundle issuedAt is in the future',
  'bundle issuedAt must be a non-negative Unix timestamp',
  'bundle signature is invalid',
  'bundle signature must be a 128-character lowercase hex string',
  'bundle signer must be a 64-character lowercase hex string',
  'bundle signer is not trusted',
  'trustedPublishers[0] must be a 64-character lowercase hex string',
  'no trusted bundle publishers configured',
  'bundle type must be nostr-veil-deployment-bundle',
  'bundle version must be 1',
  'acceptedCircleIds must be unique',
  'event[0] no accepted circle IDs were supplied',
  'manifest[0]: manifest is expired',
  'manifest[0]: circleId does not match manifest members',
  'manifest[0]: manifest does not allow profile user-reputation-abuse-reporting',
  'manifest[0]: manifest is revoked',
  'manifest[0]: manifest is superseded',
  'event[0] circle is not accepted by deployment policy',
  'companion evidence "check" checkedAt is in the future',
  'companion evidence "check" missing checkedAt for freshness check',
  'companion evidence "check" did not pass',
  'companion evidence "check" maxAgeSeconds must be a non-negative integer',
  'companion evidence "check" is missing',
  'companion evidence "check" is outside the accepted freshness window',
  'companion evidence "check" subject does not match expected subject',
  'event[0] publisher is not accepted by deployment policy',
  'event[0] Nostr event signature is invalid',
  'event[0] is not a fully signed Nostr event',
  'federation: event[0]: not federation-scoped',
  'federation has fewer than 4 distinct signers',
  'event[0] metric "rank" is above deployment maximum 10',
  'event[0] metric "rank" is below deployment minimum 95',
  'event[0] metric "rank" must be an integer',
  'event[0] metric "rank" is not a finite number',
  'event[0] missing required metric "followers"',
  'event[0] metric "rank" is not allowed by deployment policy',
  'event[0] syntax: Missing required d-tag.',
  'acceptedPublishers must be a list of at least one publisher key',
  'maxAgeSeconds must be a non-negative integer',
  'maxFutureSeconds must be a non-negative integer',
  'metricPolicies.rank.min must be a finite number',
  'minDistinctSigners must be a positive integer',
  'production verifier requires policy.requireNostrSignature = true',
  'profile expects exactly one assertion event',
  'event[0] kind 1 does not match profile kind 30382',
  'event[0] subject does not match profile formats: pubkey',
  'event[0] p tag does not match expected subject hint',
  'event[0] missing d tag',
  'event[0] subject does not match expected subject',
  'event[0] proof: veil-agg is "max" but "median" is required',
  'event[0] proof: Signature at index 0 metric "rank" value 5 is above the contribution maximum 1',
  'event[0] proof: Invalid LSAG signature at index 0',
  'event[0] has fewer than 3 distinct signers',
  'now must be a Unix timestamp',
  'limits.maxTagCount must be a non-negative number',
  'event[0] has 1201 tags, more than the limit of 1200',
  'event[0] has a tag name longer than 64 characters',
  'event[0] has a d tag longer than 512 characters',
  // A message no rule knows, which a caller holding only strings reads under the general code
  'the verifier could not finish',
  'expectedSubject must be a string',
  'metricPolicies.rank.required must be true or false',
  'profile.proofVersion must be "v1" or "v2"',
  'circleManifests[0].members must be a list of strings',
  'event[0] assertion has expired (NIP-40 expiration 1777999400)',
  'manifest[0]: manifest issuedAt is in the future',
  // The same, cut down to the words a rule looks for, and one that begins as a proof tag does
  'companion evidence',
  'bundle is expired and the manifest is revoked',
  'veil-agg is "max" but "median" is required',
]

const CODES = Object.keys(VERIFICATION_ISSUE_EXPLANATIONS)

/** Text of the same kind that says nothing. A name that begins `veil-` is read as a proof tag, so that much is kept. */
function neutral(text: string): string {
  return text.startsWith('veil-') ? 'veil-nothing in particular' : 'nothing in particular'
}

/**
 * How many runs must raise the same errors as neutral text, where that is not
 * every run. A signed metric name longer than the proof verifier's limit of
 * 64 characters breaks that limit, and a short neutral name does not. So does
 * any tag name that long, which turns the event away before a tag is read.
 */
const WITHIN_NAME_LIMIT = MESSAGES.filter(text => text.length <= 64).length
const COMPARED_AT_LEAST: Record<string, number> = {
  'a tag name': WITHIN_NAME_LIMIT,
  'a tag name, with no value': WITHIN_NAME_LIMIT,
  'a tag name, twice': WITHIN_NAME_LIMIT,
  'a signed metric name': WITHIN_NAME_LIMIT,
}

function resigned(fields: { kind?: unknown; tags?: unknown[][] }): SignedEvent {
  return signEvent({ ...assertion, ...fields } as EventTemplate, PUBLISHER_KEY)
}

const without = (name: string): string[][] => assertion.tags.filter(tag => tag[0] !== name)
const replaced = (name: string, at: number, text: string): string[][] =>
  assertion.tags.map(tag => tag[0] === name ? [...tag.slice(0, at), text, ...tag.slice(at + 1)] : tag)

/** The assertion with the message inside each signature changed, signed again by the publisher. */
function withSignedMessage(change: (message: Record<string, unknown>) => void): SignedEvent {
  return resigned({
    tags: assertion.tags.map(tag => {
      if (tag[0] !== 'veil-sig') return tag
      const signature = JSON.parse(tag[1]) as { message: string }
      const message = JSON.parse(signature.message) as Record<string, unknown>
      change(message)
      return ['veil-sig', JSON.stringify({ ...signature, message: JSON.stringify(message) }), ...tag.slice(2)]
    }),
  })
}

/** Where an event can put text of its own choosing, and have a message quote it or act on it. */
const PLACES: Record<string, (text: string) => SignedEvent> = {
  'a tag name': text => resigned({ tags: [...assertion.tags, [text, '1']] }),
  'a tag name, with no value': text => resigned({ tags: [...assertion.tags, [text]] }),
  'a tag name, twice': text => resigned({ tags: [...assertion.tags, [text, '1'], [text, '2']] }),
  'a tag value': text => resigned({ tags: [...assertion.tags, ['zz', text]] }),
  'the value of a metric tag': text => resigned({ tags: [...assertion.tags, ['followers', text]] }),
  'the rank value': text => resigned({ tags: replaced('rank', 1, text) }),
  'the d value': text => resigned({ tags: replaced('d', 1, text) }),
  'the p value': text => resigned({ tags: replaced('p', 1, text) }),
  'a k value': text => resigned({ tags: [...assertion.tags, ['k', text]] }),
  'an expiration value': text => resigned({ tags: [...assertion.tags, ['expiration', text]] }),
  'the veil-agg value': text => resigned({ tags: [...without('veil-agg'), ['veil-agg', text]] }),
  'the veil-version value': text => resigned({ tags: [...without('veil-version'), ['veil-version', text]] }),
  'the veil-threshold signer count': text => resigned({ tags: replaced('veil-threshold', 1, text) }),
  'the veil-threshold circle size': text => resigned({ tags: replaced('veil-threshold', 2, text) }),
  'a veil-scope value': text => resigned({ tags: [...assertion.tags, ['veil-scope', text]] }),
  'a veil-sig payload': text => resigned({ tags: replaced('veil-sig', 1, text) }),
  'a signed metric name': text => withSignedMessage((message) => { message.metrics = { [text]: 'x' } }),
  'the signed subject tag': text => withSignedMessage((message) => { message.subjectTag = text }),
  'the kind': text => resigned({ kind: text }),
}

type Result = { errors: string[]; issues?: VerificationIssue[] }

function codes(result: Result): string[] {
  return (result.issues ?? []).map(issue => issue.code)
}

/**
 * Everything a caller reads off a verification that an issue code feeds. One
 * production call holds the result of each verifier beneath it, so the proof
 * is verified once. Given the text an event carries, it also gives the errors
 * raised, with that text written as <text> wherever one quotes it.
 */
function observed(event: SignedEvent, against = bundle, text?: string) {
  const production = verifyProductionDeployment(event, against, trusted)
  const report = createProductionDecisionReport(production)

  return {
    decision: production.decision,
    profile: codes(production.deployment.profileVerification),
    policy: codes(production.deployment),
    bundle: codes(production.bundle),
    production: codes(production),
    controls: Object.fromEntries(report.controls.map(control => [control.id, control.status])),
    action: report.recommendedAction,
    // An error that is the text itself, word for word, was raised in its own right
    ...(text === undefined ? {} : {
      raised: production.errors.map(error => error === text ? error : error.split(text).join('<text>')),
    }),
  }
}

describe('the text put to the test', () => {
  it('covers every code a message can be read as', () => {
    const reached = new Set(MESSAGES.map(message => classifyVerificationError(message).code))

    expect(CODES.filter(code => !reached.has(code as never))).toEqual([])
  })
})

describe('text chosen by whoever wrote the event', () => {
  // Some text changes which errors are raised: a long metric name breaks a
  // length limit that a short one does not. That is not the text renaming an
  // error, so those runs are counted and left out. Every other run raises the
  // same errors as neutral text, and must file them the same way.
  it.each(Object.keys(PLACES))('does not move an issue code or a report control, as %s', (place) => {
    const moved: string[] = []
    let compared = 0

    const baseline = new Map<string, string>()
    for (const text of MESSAGES) {
      const plain = neutral(text)
      if (!baseline.has(plain)) baseline.set(plain, JSON.stringify(observed(PLACES[place](plain), bundle, plain)))
      const base = JSON.parse(baseline.get(plain) as string) as ReturnType<typeof observed>
      const withText = observed(PLACES[place](text), bundle, text)
      if (JSON.stringify(withText.raised) !== JSON.stringify(base.raised)) continue
      compared += 1
      if (JSON.stringify(withText) !== JSON.stringify(base)) {
        moved.push(`${JSON.stringify(text)}: ${JSON.stringify(withText)} where neutral text gives ${JSON.stringify(base)}`)
      }
    }

    expect(moved).toEqual([])
    expect(compared, 'runs that raised the same errors as neutral text').toBeGreaterThanOrEqual(COMPARED_AT_LEAST[place] ?? MESSAGES.length)
  })

  // One message of the policy verifier quotes a tag name too: the one for a
  // metric the policy does not allow. It is raised only by a policy that
  // rejects unknown metrics, which the bundle above does not.
  it('does not move an issue code or a report control, as the name of a metric the policy rejects', () => {
    const closed = signedBy(createDeploymentPolicy(profile, {
      ...gate,
      metricPolicies: { rank: {} },
      rejectUnknownMetrics: true,
      requireNostrSignature: true,
    }))
    const under = (text: string) => observed(resigned({ tags: [...assertion.tags, [text, '1']] }), closed)
    const baseline = under('nothing in particular')
    // A name over the tag name limit turns the event away before its metrics
    // are read, so it is set beside a neutral name of its own length
    const long = (length: number) => under('n'.repeat(length))

    expect(baseline.policy).toContain('metric.unknown')
    expect(baseline.controls['metric-policy']).toBe('fail')
    expect(long(65).policy).toEqual(['event.limit_exceeded'])
    expect(long(65).controls['metric-policy']).toBe('fail')
    // A name that begins veil- is read as a proof tag and is no metric at all
    expect(MESSAGES.filter(text => !text.startsWith('veil-')
      && JSON.stringify(under(text)) !== JSON.stringify(text.length > 64 ? long(text.length) : baseline)))
      .toEqual([])
  })

  // The three that an independent read of 0.37.1 demonstrated
  it('cannot file a syntax and a proof failure under companion evidence', () => {
    const { controls, production } = observed(resigned({ tags: [...assertion.tags, ['companion evidence', '1']] }))

    expect(production).toEqual(['nip85.syntax_invalid', 'proof.invalid'])
    expect(controls['profile-subject']).toBe('fail')
    expect(controls['proof-threshold']).toBe('fail')
    expect(controls['companion-evidence']).toBe('not-checked')
  })

  it('cannot hide the wrong kind behind a kind that reads as a message', () => {
    const { controls, profile: profileCodes } = observed(resigned({ kind: 'companion evidence' }))

    expect(profileCodes).toContain('profile.kind_mismatch')
    expect(controls['profile-subject']).toBe('fail')
    expect(controls['companion-evidence']).toBe('not-checked')
  })

  it('cannot fail the freshness of a bundle that is in date', () => {
    const { controls } = observed(resigned({ tags: [...assertion.tags, ['bundle is expired', '1']] }))

    expect(controls['bundle-freshness']).toBe('pass')
  })

  it('does not move the code of a federation failure', () => {
    const under = (text: string) => codes(verifyUseCaseProfile(
      resigned({ tags: [...without('veil-version'), ['veil-version', text]] }),
      FEDERATED_MODERATION_PROFILE,
      { ...gate, now: NOW },
    ))
    const baseline = under('nothing in particular')

    expect(baseline).toContain('federation.invalid')
    expect(MESSAGES.filter(text => JSON.stringify(under(text)) !== JSON.stringify(baseline))).toEqual([])
  })
})

// A policy is the operator's, so its text is no attack. A name in it must
// still not change what a failure is called.
describe('text chosen by whoever wrote the policy', () => {
  const read = (from: UseCaseDeploymentPolicy, fields: Record<string, unknown>): UseCaseDeploymentPolicy =>
    ({ ...(JSON.parse(JSON.stringify(from)) as UseCaseDeploymentPolicy), ...fields })
  const event = resigned({})

  it('does not move a code, as the id of a companion evidence requirement', () => {
    const moved: string[] = []
    const under = (id: string) => {
      const malformedWindow = read(policy, { companionEvidence: [{ id, maxAgeSeconds: 'abc' }] })
      const missing = read(policy, { companionEvidence: [{ id }] })
      const failed = verifyDeploymentPolicy(event, missing, { now: NOW, companionEvidence: [{ id, status: 'fail' }] })
      return [
        codes(verifyDeploymentPolicy(event, malformedWindow, { now: NOW, companionEvidence: [{ id, status: 'pass' }] })),
        codes(verifyDeploymentPolicy(event, missing, { now: NOW })),
        codes(failed),
      ]
    }

    const baseline = under('check')
    expect(baseline).toEqual([['companion.invalid'], ['companion.missing'], ['companion.failed']])
    for (const text of MESSAGES) {
      const withText = under(text)
      if (JSON.stringify(withText) !== JSON.stringify(baseline)) moved.push(`${text}: ${JSON.stringify(withText)}`)
    }
    expect(moved).toEqual([])
  })

  it('does not move a code, as the name of a metric policy', () => {
    const moved: string[] = []
    const under = (name: string) => [
      codes(verifyDeploymentPolicy(event, read(policy, { metricPolicies: { [name]: { required: true } } }), { now: NOW })),
      codes(verifyDeploymentPolicy(event, read(policy, { metricPolicies: { [name]: { min: 'abc' } } }), { now: NOW })),
    ]

    const baseline = under('followers')
    expect(baseline).toEqual([['metric.required_missing'], ['policy.metric_policy_invalid']])
    for (const text of MESSAGES) {
      const withText = under(text)
      if (JSON.stringify(withText) !== JSON.stringify(baseline)) moved.push(`${text}: ${JSON.stringify(withText)}`)
    }
    expect(moved).toEqual([])
  })

  it('does not move a code, as the id of a profile no manifest allows', () => {
    const manifest = createCircleManifest({
      issuedAt: NOW - 100,
      members: circle.members,
      name: 'Reviewers',
      profileIds: ['some-other-profile'],
      purpose: 'issue codes',
    })
    const under = (id: string) => verifyDeploymentPolicy(
      event,
      read(policy, { circleManifests: [manifest], profile: { ...policy.profile, id } }),
      { now: NOW },
    ).issues?.filter(issue => issue.path === 'manifest[0]').map(issue => issue.code)

    expect(under('a-profile')).toEqual(['circle.profile_not_allowed'])
    expect(MESSAGES.filter(text => JSON.stringify(under(text)) !== JSON.stringify(under('a-profile')))).toEqual([])
  })
})

// Three verifiers hand their errors up as plain strings: the syntax validator,
// the proof verifier and the manifest check. The verifier above still files
// each under the code its own line gave it, with nothing read from the words.
describe('a code given where the error is raised', () => {
  const event = resigned({})
  const profileCodes = (given: EventTemplate, options: Record<string, unknown> = {}) =>
    verifyUseCaseProfile(given, profile, { ...gate, now: NOW, ...options }).issues ?? []

  it('reaches the policy verifier from a circle manifest', () => {
    const manifest = (fields: Partial<CircleManifest> = {}): CircleManifest => ({
      ...createCircleManifest({
        issuedAt: NOW - 100,
        members: circle.members,
        name: 'Reviewers',
        profileIds: [profile.id],
        purpose: 'issue codes',
      }),
      ...fields,
    })
    const under = (given: CircleManifest) => verifyDeploymentPolicy(
      event,
      { ...policy, circleManifests: [given] },
      { now: NOW },
    ).issues?.filter(issue => issue.path === 'manifest[0]').map(issue => `${issue.code}: ${issue.message}`)

    expect(under(manifest())).toEqual([])
    expect(under(manifest({ expiresAt: NOW - 1 }))).toEqual(['circle.manifest_expired: manifest[0]: manifest is expired'])
    expect(under(manifest({ status: 'revoked' }))).toEqual([
      'circle.revoked: manifest[0]: manifest is revoked',
      'circle.revoked: manifest[0]: manifest circle is revoked by deployment policy',
    ])
    expect(under(manifest({ status: 'superseded' }))).toEqual(['circle.superseded: manifest[0]: manifest is superseded'])
    expect(under(manifest({ profileIds: ['some-other-profile'] }))).toEqual([
      `circle.profile_not_allowed: manifest[0]: manifest does not allow profile ${profile.id}`,
    ])
    expect(under(manifest({ circleId: 'ee'.repeat(32) }))).toEqual([
      'circle.manifest_invalid: manifest[0]: circleId does not match manifest members',
    ])
    // A fault of the manifest's own shape is a fault of the manifest
    expect(under(manifest({ name: ' ' }))).toEqual(['circle.manifest_invalid: manifest[0]: manifest name must be non-empty'])
    expect(under(manifest({ issuedAt: NOW + 3600, expiresAt: NOW + 7200 }))).toEqual([
      'circle.manifest_issued_at_future: manifest[0]: manifest issuedAt is in the future',
    ])
  })

  it('reaches the profile verifier from the proof verifier, for the two failures of an aggregation policy', () => {
    expect(profileCodes(event, { aggregate: 'max' }).map(issue => `${issue.code}: ${issue.message}`)).toEqual([
      'proof.aggregate_mismatch: event[0] proof: veil-agg is "median" but "max" is required',
    ])
    expect(profileCodes(event, { contributionBounds: { rank: { max: 1 } } }).map(issue => issue.code)).toEqual([
      'proof.contribution_out_of_bounds',
      'proof.invalid',
      'proof.threshold_not_met',
    ])
  })

  it('reaches the profile verifier from the syntax validator, for a metric value that is not a number', () => {
    const issues = profileCodes(resigned({ tags: [...assertion.tags, ['followers', 'abc']] }))

    expect(issues.filter(issue => issue.message.includes('syntax:')).map(issue => `${issue.code}: ${issue.message}`)).toEqual([
      'metric.invalid_value: event[0] syntax: Invalid metric "followers": "abc" is not a finite number.',
      'metric.invalid_value: event[0] syntax: Invalid metric "followers": "abc" is not a finite number.',
    ])
  })

  // Three errors of the proof verifier hold a word another family's rule looked
  // for, and were filed there: a ring and a signature under the circle
  // manifest, a signed metric under the metric policy. No manifest and no
  // metric policy is at fault in any of them.
  it.each([
    ['a ring of one member', resigned({ tags: assertion.tags.map(tag => tag[0] === 'veil-ring' ? tag.slice(0, 2) : tag) }),
      'event[0] proof: veil-ring requires at least 2 members'],
    ['a signature made for another circle', withSignedMessage((message) => { message.circleId = 'ee'.repeat(32) }),
      'event[0] proof: Signature at index 0 signed message circleId mismatch'],
    ['a signed metric that is not a number', withSignedMessage((message) => { message.metrics = { rank: 'abc' } }),
      'event[0] proof: Signature at index 0 signed metric "rank" is not a finite number'],
  ])('files %s as a proof that is not sound', (_label, given, message) => {
    const issue = profileCodes(given).find(found => found.message === message)

    expect(issue).toEqual({ code: 'proof.invalid', message, path: 'event[0]' })
  })
})

describe('errors and issues', () => {
  // The same runs answer two questions. Every verifier gives one issue for
  // each error, in the same order and with the same words. And for input that
  // quotes nothing hostile, each issue has the code and the path the exported
  // classifier reads from those words, as it did before codes were given at
  // the place an error is raised.
  it('stay in step, and keep the code and path they had for honest input', () => {
    const outOfStep: string[] = []
    const changed: string[] = []
    let compared = 0
    const check = (label: string, result: Result) => {
      const issues = result.issues ?? []
      if (issues.length !== result.errors.length || issues.some((issue, index) => issue.message !== result.errors[index])) {
        outOfStep.push(`${label}: ${JSON.stringify(result.errors)} against ${JSON.stringify(issues.map(issue => issue.message))}`)
      }
      for (const issue of issues) {
        compared += 1
        const read = classifyVerificationError(issue.message)
        if (read.code !== issue.code || read.path !== issue.path) {
          changed.push(`${label}: ${JSON.stringify(issue)} where the classifier reads ${JSON.stringify(read)}`)
        }
      }
    }
    const events: Array<[string, unknown]> = [
      ['as signed', resigned({})],
      ['unsigned', assertion],
      ['an unknown tag', resigned({ tags: [...assertion.tags, ['zz', '1']] })],
      ['another kind', resigned({ kind: 30383 })],
      ['stale', resigned({}) && signEvent({ ...assertion, created_at: NOW - 86_400 }, PUBLISHER_KEY)],
      ['no tags', { ...resigned({}), tags: null }],
      ['nothing', null],
    ]
    const strict = signedBy(createDeploymentPolicy(profile, {
      ...gate,
      companionEvidence: [{ id: 'check', maxAgeSeconds: 300 }],
      metricPolicies: { rank: { min: 95 }, followers: { required: true } },
      requireNostrSignature: true,
    }))
    const stranger = createSignedDeploymentBundle(policy, { expiresAt: NOW + 600, id: 'x', issuedAt: NOW - 10, privateKey: '99'.repeat(32) })

    for (const [label, event] of events) {
      for (const [which, against] of [['plain', bundle], ['strict', strict], ['stranger', stranger]] as const) {
        for (const now of [NOW, NOW + 3600, Number.NaN]) {
          const options = { now, trustedPublishers: [bundle.signer] }
          const name = `${label}, ${which} bundle, now ${now}`
          check(`profile: ${name}`, verifyUseCaseProfile(event as EventTemplate, profile, { ...gate, now }))
          check(`policy: ${name}`, verifyDeploymentPolicy(event as EventTemplate, against.policy, { now }))
          check(`bundle: ${name}`, verifyDeploymentBundle(event as EventTemplate, against, options))
          check(`production: ${name}`, verifyProductionDeployment(event as EventTemplate, against, options))
        }
      }
    }

    expect(outOfStep).toEqual([])
    expect(changed).toEqual([])
    expect(compared).toBeGreaterThan(500)
  })

  it('are held together, so a result with no issues field still gives its codes to the verifier above', () => {
    const found = new CodedErrors()
    found.add('bundle.expired', 'bundle is expired')
    found.add('metric.unknown', 'event[0] metric "x" is not allowed by deployment policy', 'event[0].tags.x')
    const errors = found.errors

    expect(errors).toEqual(['bundle is expired', 'event[0] metric "x" is not allowed by deployment policy'])
    expect(issuesOf({ errors })).toEqual([
      { code: 'bundle.expired', message: 'bundle is expired' },
      { code: 'metric.unknown', message: 'event[0] metric "x" is not allowed by deployment policy', path: 'event[0].tags.x' },
    ])
  })

  // A result built by hand, or a list added to afterwards. Its words are not
  // read for a code: that is the reading an event could steer.
  it('give the general code to an error with no issue behind it', () => {
    expect(issuesOf({ errors: ['bundle is expired', 'companion evidence "check" is missing'] })).toEqual([
      { code: 'verification.failed', message: 'bundle is expired' },
      { code: 'verification.failed', message: 'companion evidence "check" is missing' },
    ])

    const found = new CodedErrors()
    found.add('bundle.expired', 'bundle is expired')
    const errors = found.errors
    errors.push('bundle signer is not trusted')

    expect(issuesOf({ errors }).map(issue => issue.code)).toEqual(['bundle.expired', 'verification.failed'])
  })
})

describe('the library itself', () => {
  // The classifier stays exported for a caller who holds only strings. Inside
  // the library a code read from a message is a code an event can choose.
  it('reads no code out of a message', () => {
    const source = fileURLToPath(new URL('../../src', import.meta.url))
    const files = readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.ts') && file !== join('profiles', 'issues.ts'))
    const readers = files.filter(file => /classifyVerificationError|issuesFromErrors|codeFromError/u
      .test(readFileSync(join(source, file), 'utf8')))

    expect(files.length).toBeGreaterThan(20)
    expect(readers).toEqual([])
  })
})
