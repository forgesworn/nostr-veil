import { describe, expect, it } from 'vitest'
import {
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  contributeAssertion,
  createCircleManifest,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  explainVerificationIssue,
  remediationForIssue,
  signEvent,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { CompanionEvidence, EventTemplate } from '../../src/index.js'

// A later release can add an issue code. A result it wrote, stored as JSON and
// read back by this version's report, then carries a code this version does
// not know. The report must still be given, and must not say that anything
// passed: it cannot tell what the unknown issue was about.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const UNKNOWN = 'This version of nostr-veil does not know this issue code.'
const UNKNOWN_CONTROL = 'The result carries an issue code this version of nostr-veil does not know, so this report cannot say that this passed.'
const UNKNOWN_FAMILY = 'The result carries an issue code of this control\'s family that this version of nostr-veil does not know, so this report cannot say what failed.'

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const subject = pubkey('99'.repeat(32))
const contributions = members.map((member, index) => contributeAssertion(
  circle, subject, { rank: 90 - index * 5 }, member.priv, circle.members.indexOf(member.pub), { proofVersion: 'v2' },
))
const proof: EventTemplate = { ...aggregateContributions(circle, subject, contributions, { proofVersion: 'v2' }), created_at: NOW }
const policy = createDeploymentPolicy(USER_REPUTATION_ABUSE_REPORTING_PROFILE, {
  acceptedCircleIds: [circle.circleId], expectedSubject: subject, requireNostrSignature: true,
})
const bundle = createSignedDeploymentBundle(policy, { expiresAt: NOW + 600, id: 'unknown', issuedAt: NOW - 10, privateKey: OPERATOR_KEY })
const accepted = verifyProductionDeployment(signEvent(proof, PUBLISHER_KEY), bundle, { now: NOW, trustedPublishers: [bundle.signer] })

/** A result as a later release might have rejected it, for a fault it has a code for, read back from JSON */
function later(code: unknown, from = accepted) {
  const stored = JSON.parse(JSON.stringify(from)) as typeof accepted
  const message = 'a fault this version has no code for'
  return { ...stored, decision: 'reject', valid: false, errors: [...stored.errors, message], issues: [...stored.issues, { code, message }] } as unknown as typeof accepted
}

const run = (events: unknown, against = bundle, trustedPublishers = [bundle.signer]) =>
  verifyProductionDeployment(events as never, against, { now: NOW, trustedPublishers })
const malformed = createSignedDeploymentBundle({ ...JSON.parse(JSON.stringify(policy)), acceptedCircleIds: 'one circle' } as never, {
  expiresAt: NOW + 600, id: 'malformed', issuedAt: NOW - 10, privateKey: OPERATOR_KEY,
})

// Each way the report settles its controls, so each is read with a code from no family it knows
const PATHS: Record<string, () => typeof accepted> = {
  'an accepted result': () => accepted,
  'a bundle from a publisher it does not trust': () => run(signEvent(proof, PUBLISHER_KEY), bundle, [pubkey('77'.repeat(32))]),
  'a policy with a field of the wrong type': () => run(signEvent(proof, PUBLISHER_KEY), malformed, [malformed.signer]),
  'no assertion': () => run([]),
  'a stale assertion, whose code it knows': () => run(signEvent({ ...proof, created_at: NOW - 400 * 86_400 }, PUBLISHER_KEY)),
}

const UNREADABLE = 'An assertion is too malformed to read, so this could not be checked.'
const withoutRing: EventTemplate = { ...proof, tags: proof.tags.filter(tag => tag[0] !== 'veil-ring') }
// A tag with an element that is not a string makes the assertion too malformed to read
const unreadable = () => run(signEvent({ ...proof, tags: [...proof.tags, ['x', 7] as never] }, PUBLISHER_KEY))
const manifest = JSON.parse(JSON.stringify(createCircleManifest({
  issuedAt: NOW - 10, expiresAt: NOW + 600, members: [...circle.members], name: 'Reviewers',
  profileIds: [USER_REPUTATION_ABUSE_REPORTING_PROFILE.id], purpose: 'Probe',
})))
const timed = createSignedDeploymentBundle(createDeploymentPolicy(USER_REPUTATION_ABUSE_REPORTING_PROFILE, {
  circleManifests: [manifest], companionEvidence: [{ id: 'check', maxAgeSeconds: 300 }],
  expectedSubject: subject, now: NOW, requireNostrSignature: true,
}), { expiresAt: NOW + 600, id: 'timed', issuedAt: NOW - 10, privateKey: OPERATOR_KEY })
const evidence: CompanionEvidence[] = [{ id: 'check', status: 'pass', checkedAt: NOW }]
// A time it cannot compare, so no manifest expiry and no evidence age was compared
const atNoTime = () => verifyProductionDeployment(signEvent(proof, PUBLISHER_KEY), timed, {
  companionEvidence: evidence, now: Number.NaN, trustedPublishers: [timed.signer],
})
const withoutEvidence = () => verifyProductionDeployment(signEvent(proof, PUBLISHER_KEY), timed, {
  now: NOW, trustedPublishers: [timed.signer],
})
const bounded = createSignedDeploymentBundle(createDeploymentPolicy(USER_REPUTATION_ABUSE_REPORTING_PROFILE, {
  acceptedCircleIds: [circle.circleId], expectedSubject: subject, metricPolicies: { rank: { required: true, min: 95 } }, requireNostrSignature: true,
}), { expiresAt: NOW + 600, id: 'bounded', issuedAt: NOW - 10, privateKey: OPERATOR_KEY })
// A bound that is not a number was not applied, so no metric code is raised
const wordBound = createSignedDeploymentBundle({ ...JSON.parse(JSON.stringify(policy)), metricPolicies: { rank: { min: 'ninety' } } } as never, {
  expiresAt: NOW + 600, id: 'word-bound', issuedAt: NOW - 10, privateKey: OPERATOR_KEY,
})
/** Each code of a family given as one this version does not know, as a later release might name the same faults */
function renamed(result: typeof accepted, family: string) {
  const stored = JSON.parse(JSON.stringify(result)) as typeof accepted
  return { ...stored, issues: stored.issues.map(issue => issue.code.startsWith(`${family}.`) ? { ...issue, code: `${family}.added_later` } : issue) } as unknown as typeof accepted
}

const KNOWN_REASONS: Record<string, [string, string, () => typeof accepted]> = {
  'a circle code it knows': ['circle-policy',
    'The assertion names no circle the deployment accepts, or the deployment\'s accepted circles or circle manifests are missing, malformed, expired, not yet valid, revoked, superseded, or not allowed for this profile.',
    () => later('circle.added_later', run(signEvent(withoutRing, PUBLISHER_KEY)))],
  'a circle manifest at a time it cannot compare': ['circle-policy',
    'The verification time cannot be compared, so no circle manifest was checked for expiry.',
    () => later('circle.added_later', atNoTime())],
  'a circle check of an assertion too malformed to read': ['circle-policy', UNREADABLE, () => later('circle.added_later', unreadable())],
  'a companion code it knows': ['companion-evidence',
    'A required companion evidence check is missing, failed, stale, malformed, or for the wrong subject.',
    () => later('companion.added_later', withoutEvidence())],
  'companion evidence at a time it cannot compare': ['companion-evidence',
    'The verification time cannot be compared, so no companion evidence was checked for age.',
    () => later('companion.added_later', atNoTime())],
  'a metric code it knows': ['metric-policy',
    'At least one metric is missing, unexpected, non-numeric, non-integer, or outside the deployment bounds, or a bound in the policy is malformed.',
    () => later('metric.added_later', run(signEvent(proof, PUBLISHER_KEY), bounded))],
  'a metric check of an assertion too malformed to read': ['metric-policy', UNREADABLE, () => later('metric.added_later', unreadable())],
  'a metric bound that is not a number': ['metric-policy',
    'At least one metric is missing, unexpected, non-numeric, non-integer, or outside the deployment bounds, or a bound in the policy is malformed.',
    () => later('metric.added_later', run(signEvent(proof, PUBLISHER_KEY), wordBound))],
  'a proof code it knows': ['proof-threshold',
    'The proof, federation, threshold, or assertion freshness check failed.',
    () => later('proof.added_later', run(signEvent({ ...proof, created_at: NOW - 400 * 86_400 }, PUBLISHER_KEY)))],
  'an assertion dated at a time it cannot compare': ['proof-threshold',
    'The proof, federation, threshold, or assertion freshness check failed.',
    () => later('proof.added_later', atNoTime())],
  'a proof check of an assertion too malformed to read': ['proof-threshold', UNREADABLE, () => renamed(unreadable(), 'proof')],
}

// The controls a code of each family fails by its prefix alone
const BY_PREFIX: Record<string, string> = {
  assertion: 'proof-threshold', circle: 'circle-policy', companion: 'companion-evidence',
  federation: 'proof-threshold', metric: 'metric-policy', proof: 'proof-threshold',
}
const FAMILIES = ['assertion', 'bundle', 'circle', 'companion', 'event', 'federation', 'metric', 'nip85', 'policy', 'profile', 'proof', 'verification', 'novel']

describe('a result that carries an issue code this version does not know', () => {
  // A guard, which holds on the parent too: what a result read back from JSON gives
  it('is read back from JSON as it was written, when every code is known', () => {
    expect(createProductionDecisionReport(JSON.parse(JSON.stringify(accepted))))
      .toEqual(createProductionDecisionReport(accepted))
  })

  it.each(FAMILIES)('is given a report for a %s code, in which no control passes', (family) => {
    const code = `${family}.added_later`
    const result = later(code)
    expect(() => createProductionDecisionReport(result)).not.toThrow()
    const report = createProductionDecisionReport(result)

    expect(report.controls.filter(item => item.status === 'pass').map(item => item.id)).toEqual([])
    expect(report.issues.find(issue => issue.code === code)).toMatchObject({ action: 'manual-review', summary: UNKNOWN })
    expect(report.recommendedAction).toBe('manual-review')
    if (family in BY_PREFIX) expect(report.controls.find(item => item.id === BY_PREFIX[family])?.status).toBe('fail')
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])('does not take %s, a name every object has, for a code it knows', (code) => {
    expect(() => createProductionDecisionReport(later(code))).not.toThrow()
    const report = createProductionDecisionReport(later(code))
    expect(report.issues.find(issue => issue.code === code)).toMatchObject({ action: 'manual-review', summary: UNKNOWN })
    expect(report.controls.filter(item => item.status === 'pass').map(item => item.id)).toEqual([])
  })

  it.each(Object.keys(PATHS))('reads as not checked each control that passes without it, for %s', (path) => {
    const base = PATHS[path]()
    const plain = createProductionDecisionReport(base).controls
    expect(plain.some(item => item.status === 'pass'), 'a control that passes without the code').toBe(true)
    expect(() => createProductionDecisionReport(later('novel.added_later', base))).not.toThrow()
    const controls = createProductionDecisionReport(later('novel.added_later', base)).controls
    controls.forEach((item, index) => {
      if (plain[index].status === 'pass') expect(item).toEqual({ ...plain[index], status: 'not-checked', summary: UNKNOWN_CONTROL })
      else expect(item).toEqual(plain[index])
    })
  })

  it.each([
    ['circle', 'circle-policy'], ['companion', 'companion-evidence'], ['metric', 'metric-policy'],
    ['proof', 'proof-threshold'], ['federation', 'proof-threshold'], ['assertion', 'proof-threshold'],
  ])('fails a %s code under its control, without saying what failed', (family, id) => {
    expect(() => createProductionDecisionReport(later(`${family}.added_later`))).not.toThrow()
    const report = createProductionDecisionReport(later(`${family}.added_later`))
    expect(report.controls.find(item => item.id === id)).toMatchObject({ status: 'fail', summary: UNKNOWN_FAMILY })
  })

  // A time that cannot be compared explains a companion failure only where
  // evidence had an age to compare
  it('fails an unknown companion code at a time it cannot compare, where no evidence has an age, without saying what failed', () => {
    const untimed = createSignedDeploymentBundle(createDeploymentPolicy(USER_REPUTATION_ABUSE_REPORTING_PROFILE, {
      acceptedCircleIds: [circle.circleId], companionEvidence: [{ id: 'check' }], expectedSubject: subject, requireNostrSignature: true,
    }), { expiresAt: NOW + 600, id: 'untimed', issuedAt: NOW - 10, privateKey: OPERATOR_KEY })
    const result = verifyProductionDeployment(signEvent(proof, PUBLISHER_KEY), untimed, {
      companionEvidence: evidence, now: Number.NaN, trustedPublishers: [untimed.signer],
    })
    expect(() => createProductionDecisionReport(later('companion.added_later', result))).not.toThrow()
    expect(createProductionDecisionReport(later('companion.added_later', result)).controls.find(item => item.id === 'companion-evidence'))
      .toMatchObject({ status: 'fail', summary: UNKNOWN_FAMILY })
  })

  // A reason the report knows, a code it knows or a fact it can see, keeps its
  // sentence beside a code of the same family that it does not know
  it.each(Object.keys(KNOWN_REASONS))('keeps the sentence of a reason it knows beside an unknown code of the family, for %s', (label) => {
    const [id, sentence, stored] = KNOWN_REASONS[label]
    expect(() => createProductionDecisionReport(stored())).not.toThrow()
    const report = createProductionDecisionReport(stored())
    expect(report.controls.find(item => item.id === id)).toMatchObject({ status: 'fail', summary: sentence })
  })

  // A store can hand back anything in place of a code
  it.each([5, null, {}, undefined, { toString: 1 }, ['circle.unaccepted']] as unknown[])('is given a report for a stored code of %j', (code) => {
    expect(() => createProductionDecisionReport(later(code))).not.toThrow()
    const report = createProductionDecisionReport(later(code))
    expect(report.controls.filter(item => item.status === 'pass').map(item => item.id)).toEqual([])
    expect(report.issues[report.issues.length - 1]).toMatchObject({ action: 'manual-review', summary: UNKNOWN })
    expect(() => remediationForIssue({ code, message: '' } as never)).not.toThrow()
  })

  it('has an explanation and a remediation for such a code', () => {
    for (const code of ['novel.added_later', 'toString']) {
      expect(explainVerificationIssue(code as never)).toMatchObject({ action: 'manual-review', summary: UNKNOWN })
      expect(typeof remediationForIssue(code as never)).toBe('string')
    }
  })

  it.each([null, undefined, 5])('has an explanation and a remediation for %s in place of an issue', (value) => {
    expect(() => explainVerificationIssue(value as never)).not.toThrow()
    expect(explainVerificationIssue(value as never)).toMatchObject({ action: 'manual-review', summary: UNKNOWN })
    expect(() => remediationForIssue(value as never)).not.toThrow()
  })
})
