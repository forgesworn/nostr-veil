import { describe, expect, it } from 'vitest'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'
import { assertion as sourceAssertion } from '../../examples/use-cases/source-corroboration.js'
import {
  FEDERATED_MODERATION_PROFILE,
  SOURCE_CORROBORATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  computeCircleId,
  contributeAssertion,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  signEvent,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { EventTemplate } from '../../src/index.js'

// The profile control says the assertion matches the profile's kind, subject,
// subject hint and NIP-85 syntax. Two kinds of tag left it passing on an
// assertion that the proof verifier turns away:
// - A tag that cannot be read, where the syntax check does not look, such as a
//   veil- tag with an element that is not a string. The checks behind the
//   control read only the tags that can be read. An assertion too malformed to
//   read now fails it, as it fails the circle, proof and metric controls.
// - A second d tag, or a second k tag on kind 30385, with no value or with a
//   value that is not a string. The syntax check counted only the ones whose
//   value is a string. It now counts every one, as it counts every p, e, a and
//   i tag.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const UNREADABLE = 'An assertion is too malformed to read, so this could not be checked.'
const MISMATCH = 'The assertion does not match the expected profile shape, subject, subject hint, or NIP-85 syntax.'
const MATCHES = 'The assertion matches the profile kind, canonical subject, subject hint, and NIP-85 syntax policy.'

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const proofFor = (about: string): EventTemplate => {
  const contributions = members.map((member, index) => contributeAssertion(
    circle, about, { rank: 90 - index * 5 }, member.priv, circle.members.indexOf(member.pub), { proofVersion: 'v2' },
  ))
  return { ...aggregateContributions(circle, about, contributions, { proofVersion: 'v2' }), created_at: NOW }
}
const subject = pubkey('99'.repeat(32))
const proof = proofFor(subject)
const template = (event: EventTemplate): EventTemplate => ({ kind: event.kind, tags: event.tags, content: event.content, created_at: event.created_at })
const withTag = (event: EventTemplate, tag: unknown[], at: 'first' | 'last' = 'last'): EventTemplate => ({
  ...template(event), tags: at === 'first' ? [tag as string[], ...event.tags] : [...event.tags, tag as string[]],
})
const signed = (event: EventTemplate) => signEvent(template(event), PUBLISHER_KEY)
const ringOf = (event: EventTemplate) => event.tags.find(tag => tag[0] === 'veil-ring')!.slice(1)
const dOf = (event: EventTemplate) => event.tags.find(tag => tag[0] === 'd')![1]

function production(events: unknown, policy: unknown, now = NOW) {
  const bundle = createSignedDeploymentBundle(policy as never, {
    expiresAt: now + 600, id: 'profile-control', issuedAt: now - 10, privateKey: OPERATOR_KEY,
  })
  const result = verifyProductionDeployment(events as never, bundle, { now, trustedPublishers: [bundle.signer] })
  const report = createProductionDecisionReport(result)
  return { result, report, control: (id: string) => report.controls.find(item => item.id === id) }
}

const policy = createDeploymentPolicy(USER_REPUTATION_ABUSE_REPORTING_PROFILE, {
  acceptedCircleIds: [circle.circleId], expectedSubject: subject, requireNostrSignature: true,
})
const accepted = production(signed(proof), policy)

const PROFILE_CODES = [
  'profile.event_count_invalid',
  'profile.kind_mismatch',
  'profile.subject_format_invalid',
  'profile.subject_hint_mismatch',
  'profile.subject_mismatch',
  'nip85.syntax_invalid',
]

describe('the profile control', () => {
  // A guard, which holds on the parent too
  it('passes for the assertion as published', () => {
    expect(accepted.result.decision).toBe('accept')
    expect(accepted.control('profile-subject')).toMatchObject({ status: 'pass', summary: MATCHES })
  })

  // Guards, which hold on the parent too: each code fails the control alone,
  // and changes no other control
  it.each(PROFILE_CODES)('fails for %s alone', (code) => {
    const stored = JSON.parse(JSON.stringify(accepted.result)) as typeof accepted.result
    const message = 'a fault of the profile'
    const result = { ...stored, decision: 'reject', valid: false, errors: [...stored.errors, message], issues: [...stored.issues, { code, message }] }
    const report = createProductionDecisionReport(result as never)
    expect(report.controls.find(item => item.id === 'profile-subject')).toMatchObject({ status: 'fail', summary: MISMATCH })
    report.controls.forEach((item, index) => {
      if (item.id !== 'profile-subject') expect(item).toEqual(accepted.report.controls[index])
    })
  })

  // A guard, which holds on the parent too: the profile control is the only one
  // that can say what is wrong with it
  it('fails for a valid proof about another subject, and is the only control to fail', () => {
    const run = production(signed(proofFor(pubkey('98'.repeat(32)))), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.result.issues.map(issue => issue.code)).toEqual(['profile.subject_mismatch'])
    expect(run.report.controls.filter(item => item.status === 'fail').map(item => item.id)).toEqual(['profile-subject'])
  })
})

// Tags the syntax check does not read, each with an element that is not a string
const UNREAD: Array<[string, unknown[]]> = [
  ['a second ring tag with a member that is not a string', ['veil-ring', circle.members[0], 7]],
  ['an aggregate tag whose value is not a string', ['veil-agg', 7]],
  ['a threshold tag whose value is not a string', ['veil-threshold', 7]],
]

describe('the profile control, for an assertion with a tag that cannot be read', () => {
  it.each(UNREAD)('fails, with %s', (_label, tag) => {
    const run = production(signed(withTag(proof, tag)), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.control('profile-subject')).toMatchObject({ status: 'fail', summary: UNREADABLE })
  })

  // A guard, which holds on the parent too: where the syntax check reads the
  // tag, the control keeps that check's sentence
  it('keeps the syntax check\'s sentence where that check reads the tag', () => {
    const run = production(signed(withTag(proof, ['x', 7])), policy)
    expect(run.result.issues.map(issue => issue.code)).toContain('nip85.syntax_invalid')
    expect(run.control('profile-subject')).toMatchObject({ status: 'fail', summary: MISMATCH })
  })
})

describe('the profile control, for an assertion with a second d tag or subject tag', () => {
  const DUPLICATE_D = 'event[0] syntax: Duplicate d-tag.'

  it.each([
    ['a second d tag with no value, after the first', ['d'], 'last'],
    ['a second d tag with no value, before the first', ['d'], 'first'],
    ['a second d tag whose value is not a string', ['d', 7], 'last'],
  ] as Array<[string, unknown[], 'first' | 'last']>)('fails, with %s', (_label, tag, at) => {
    const run = production(signed(withTag(proof, tag, at)), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.result.issues.filter(issue => issue.message === DUPLICATE_D)).toEqual([expect.objectContaining({ code: 'nip85.syntax_invalid' })])
    expect(run.control('profile-subject')).toMatchObject({ status: 'fail', summary: MISMATCH })
  })

  describe('on kind 30385, whose subject tag is k', () => {
    const now = sourceAssertion.created_at ?? NOW
    const sourcePolicy = createDeploymentPolicy(SOURCE_CORROBORATION_PROFILE, {
      acceptedCircleIds: [computeCircleId(ringOf(sourceAssertion))], expectedSubject: dOf(sourceAssertion), requireNostrSignature: true,
    })

    // A guard on the fixture, which holds on the parent too
    it('passes as published', () => {
      const run = production(signed(sourceAssertion), sourcePolicy, now)
      expect(run.result.decision).toBe('accept')
      expect(run.control('profile-subject')).toMatchObject({ status: 'pass', summary: MATCHES })
    })

    it('fails with a second k tag that has no value', () => {
      const run = production(signed(withTag(sourceAssertion, ['k'])), sourcePolicy, now)
      expect(run.result.decision).toBe('reject')
      expect(run.result.issues.filter(issue => issue.message === 'event[0] syntax: Duplicate k-tag.')).toEqual([
        expect.objectContaining({ code: 'nip85.syntax_invalid' }),
      ])
      expect(run.control('profile-subject')).toMatchObject({ status: 'fail', summary: MISMATCH })
    })
  })

  describe('in a federation', () => {
    const now = moderationEvents[0].created_at ?? NOW
    const federation = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
      acceptedCircleIds: moderationEvents.map(event => computeCircleId(ringOf(event))),
      expectedSubject: dOf(moderationEvents[0]),
      requireNostrSignature: true,
    })

    // A guard on the fixture, which holds on the parent too
    it('passes as published', () => {
      const run = production(moderationEvents.map(signed), federation, now)
      expect(run.result.decision).toBe('accept')
      expect(run.control('profile-subject')).toMatchObject({ status: 'pass', summary: MATCHES })
    })

    it('fails where one event has a second d tag with no value', () => {
      const run = production(moderationEvents.map((event, index) => signed(index === 1 ? withTag(event, ['d']) : event)), federation, now)
      expect(run.result.decision).toBe('reject')
      expect(run.control('profile-subject')).toMatchObject({ status: 'fail', summary: MISMATCH })
    })
  })
})
