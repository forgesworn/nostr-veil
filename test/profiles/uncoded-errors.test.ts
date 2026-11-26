import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  classifyVerificationError,
  contributeAssertion,
  createCircleManifest,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  explainVerificationIssue,
  issuesFromErrors,
  resolveCircleManifests,
  signEvent,
  verifyCircleManifest,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { EventTemplate, VerificationIssueCode } from '../../src/index.js'

// An issue code decides which control of the production report fails. An
// error raised under the general code, verification.failed, fails none of
// them, so a run rejected for that error alone read as though every check had
// passed. Thirteen places in the library raised one. Each now gives the code
// of its family, and a test below pins each of them by its message.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}
const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const subject = pubkey('99'.repeat(32))
const contributions = members.map((member, index) => contributeAssertion(
  circle, subject, { rank: 90 - index * 5 }, member.priv, circle.members.indexOf(member.pub), { proofVersion: 'v2' },
))
const proof: EventTemplate = { ...aggregateContributions(circle, subject, contributions, { proofVersion: 'v2' }), created_at: NOW }
const signed = (event: EventTemplate) => signEvent(event, PUBLISHER_KEY)
const gate = { acceptedCircleIds: [circle.circleId], expectedSubject: subject, requireNostrSignature: true }
const bundleOf = (policy: unknown) => createSignedDeploymentBundle(policy as never, {
  expiresAt: NOW + 600, id: 'uncoded', issuedAt: NOW - 10, privateKey: OPERATOR_KEY,
})

function production(event: EventTemplate, policy: unknown) {
  const bundle = bundleOf(policy)
  const result = verifyProductionDeployment(event, bundle, { now: NOW, trustedPublishers: [bundle.signer] })
  const report = createProductionDecisionReport(result)
  return {
    result,
    codes: result.issues.map(issue => issue.code),
    /** The codes of the issues raised with exactly this message */
    codesOf: (message: string) => result.issues.filter(issue => issue.message === message).map(issue => issue.code),
    status: (id: string) => report.controls.find(item => item.id === id)?.status,
    report,
  }
}

const base = JSON.parse(JSON.stringify(createDeploymentPolicy(profile, gate)))
const manifest = JSON.parse(JSON.stringify(createCircleManifest({
  issuedAt: NOW - 10, expiresAt: NOW + 600, members: [...circle.members], name: 'Reviewers', profileIds: [profile.id], purpose: 'Probe',
})))
const others = ['66', '77', '88'].map(byte => pubkey(byte.repeat(32)))
const other = JSON.parse(JSON.stringify(createCircleManifest({
  issuedAt: NOW - 10, expiresAt: NOW + 600, members: others, name: 'Others', profileIds: [profile.id], purpose: 'Probe',
})))
const viaManifests = (second: unknown) => ({
  ...JSON.parse(JSON.stringify(createDeploymentPolicy(profile, { expectedSubject: subject, circleManifests: [manifest], now: NOW, requireNostrSignature: true }))),
  circleManifests: [manifest, second],
})
const future = { ...other, issuedAt: NOW + 3600, expiresAt: NOW + 7200 }

describe('an assertion past its NIP-40 expiration', () => {
  const expiration = NOW - 600
  const expired = signed({ ...proof, tags: [...proof.tags, ['expiration', String(expiration)]] })

  it('is filed as expired, and fails the proof control', () => {
    const run = production(expired, base)
    expect(run.result.decision).toBe('reject')
    expect(run.codesOf(`event[0] assertion has expired (NIP-40 expiration ${expiration})`)).toEqual(['assertion.expired'])
    expect(run.codes).toEqual(['assertion.expired'])
    expect(run.status('proof-threshold')).toBe('fail')
    expect(run.report.recommendedAction).toBe('refresh-and-retry')
  })

  it('has an explanation of its own, not the freshness window\'s', () => {
    expect(explainVerificationIssue('assertion.expired')).toMatchObject({ action: 'refresh-and-retry' })
    expect(explainVerificationIssue('assertion.expired')?.remediation).not.toContain('maxAgeSeconds')
  })
})

describe('a malformed circle manifest beside a well-formed one', () => {
  it.each([
    ['its version', { version: 2 }, 'manifest version must be 1'],
    ['its name', { name: '' }, 'manifest name must be non-empty'],
    ['its purpose', { purpose: '' }, 'manifest purpose must be non-empty'],
    ['what it supersedes', { supersedes: ['zz'] }, 'supersedes[0] must be a 64-character lowercase hex string'],
    ['its issue date', { issuedAt: -1 }, 'issuedAt must be a non-negative Unix timestamp'],
    ['its expiry', { expiresAt: -1 }, 'expiresAt must be a non-negative Unix timestamp'],
    ['an expiry before its issue', { expiresAt: NOW - 20 }, 'expiresAt must be greater than issuedAt'],
    ['its status', { status: 'paused' }, 'manifest status must be active, revoked, or superseded'],
  ] as Array<[string, Record<string, unknown>, string]>)('is filed as an invalid manifest for %s, and fails the circle control', (_label, patch, message) => {
    const run = production(signed(proof), viaManifests({ ...other, ...patch }))
    expect(run.result.decision).toBe('reject')
    expect(run.codesOf(`manifest[1]: ${message}`)).toEqual(['circle.manifest_invalid'])
    expect(run.status('circle-policy')).toBe('fail')

    // On its own a manifest gives only messages, and the classifier reads this one as raised
    const alone = verifyCircleManifest({ ...other, ...patch }, { now: NOW })
    expect(issuesFromErrors(alone.errors).filter(issue => issue.message === message).map(issue => issue.code))
      .toEqual(['circle.manifest_invalid'])
  })

  it('is filed as issued in the future when it is, and fails the circle control', () => {
    const run = production(signed(proof), viaManifests(future))
    expect(run.codesOf('manifest[1]: manifest issuedAt is in the future')).toEqual(['circle.manifest_issued_at_future'])
    expect(run.codes).toEqual(['circle.manifest_issued_at_future'])
    expect(run.status('circle-policy')).toBe('fail')
    expect(run.report.recommendedAction).toBe('refresh-and-retry')
  })

  it('is read as issued in the future from its message, when verified or resolved on its own', () => {
    const alone = verifyCircleManifest(future, { now: NOW })
    expect(alone.valid).toBe(false)
    expect(issuesFromErrors(alone.errors).map(issue => issue.code)).toEqual(['circle.manifest_issued_at_future'])

    const resolved = resolveCircleManifests([manifest, future], { now: NOW })
    expect(resolved.errors).toEqual(['manifest[1]: manifest issuedAt is in the future'])
    expect(issuesFromErrors(resolved.errors).map(issue => issue.code)).toEqual(['circle.manifest_issued_at_future'])
  })
})

describe('an event whose tags the profile verifier cannot read', () => {
  it.each([
    ['with no d tag', proof.tags.filter(tag => tag[0] !== 'd'), 'event[0] missing d tag', 'nip85.syntax_invalid'],
    ['with two d tags', [...proof.tags, ['d', subject]], 'event[0] duplicate d tag', 'nip85.syntax_invalid'],
    ['with no p tag', proof.tags.filter(tag => tag[0] !== 'p'), 'event[0] missing p tag', 'nip85.syntax_invalid'],
    ['with two p tags', [...proof.tags, ['p', subject]], 'event[0] duplicate p tag', 'nip85.syntax_invalid'],
    ['with no veil-ring tag', proof.tags.filter(tag => tag[0] !== 'veil-ring'), 'event[0] missing veil-ring tag', 'proof.invalid'],
  ] as Array<[string, string[][], string, VerificationIssueCode]>)('files the error of its own check in its family, %s', (_label, tags, message, code) => {
    const run = production(signed({ ...proof, tags }), base)
    expect(run.result.decision).toBe('reject')
    expect(run.codesOf(message)).toEqual([code])
    expect(classifyVerificationError(message).code).toBe(code)
  })
})

// The legacy classifier reads each of these messages, whole, as the code it
// is raised with. Text an event chooses can be quoted inside another message,
// so a rule must not match part of one.
describe('the legacy classifier, given a message that quotes one of these', () => {
  const QUOTED: Array<[string, VerificationIssueCode]> = [
    [`event[0] assertion has expired (NIP-40 expiration ${NOW - 600})`, 'assertion.expired'],
    ['event[0] missing veil-ring tag', 'proof.invalid'],
    ['event[0] missing d tag', 'nip85.syntax_invalid'],
    ['event[0] duplicate p tag', 'nip85.syntax_invalid'],
    ['manifest issuedAt is in the future', 'circle.manifest_issued_at_future'],
    ['manifest[0]: manifest issuedAt is in the future', 'circle.manifest_issued_at_future'],
    ['manifest[0]: manifest version must be 1', 'circle.manifest_invalid'],
    ['expiresAt must be greater than issuedAt', 'circle.manifest_invalid'],
    ['manifest[0]: supersedes[0] is duplicated', 'circle.manifest_invalid'],
  ]
  const FAMILY_CODES = new Set(QUOTED.map(([, code]) => code))

  it.each(QUOTED)('reads %s as %s', (message, code) => {
    expect(classifyVerificationError(message).code).toBe(code)
  })

  // Guards, which hold on the parent too, where none of these rules exists
  it.each(QUOTED)('does not read %s as its code with text before or after it', (message, code) => {
    expect(classifyVerificationError(`x ${message}`).code).not.toBe(code)
    expect(classifyVerificationError(`${message} x`).code).not.toBe(code)
  })

  // Guards too. Each of these places has the text quoted under a code of its
  // own: by the syntax validator, the proof verifier and the profile verifier
  const PLACES: Record<string, (text: string) => EventTemplate> = {
    'a tag name': text => ({ ...proof, tags: [...proof.tags, [text, '1']] }),
    'the veil-agg value': text => ({ ...proof, tags: [...proof.tags.filter(tag => tag[0] !== 'veil-agg'), ['veil-agg', text]] }),
    'the kind': text => ({ ...proof, kind: text as never }),
  }

  it.each(Object.keys(PLACES))('reads no error quoting one, as %s, as a code it was not raised with', (place) => {
    const misread: string[] = []
    let quoting = 0
    for (const [text] of QUOTED) {
      const run = production(signed(PLACES[place](text)), base)
      for (const issue of run.result.issues.filter(item => item.message !== text && item.message.includes(text))) {
        quoting += 1
        const read = classifyVerificationError(issue.message).code
        if (read !== issue.code && FAMILY_CODES.has(read)) misread.push(`${issue.code} read as ${read}: ${issue.message}`)
      }
    }
    expect(misread).toEqual([])
    expect(quoting, 'errors that quote the text').toBeGreaterThanOrEqual(QUOTED.length)
  })
})

// The general code is kept only for a message that comes with no record of
// its code, such as one from an old log. This catches its plain form at any
// raise site; the tests above pin each place that used it, whatever form a
// change there takes.
describe('the library source', () => {
  it('names the general code only where it is defined and given to an unrecorded message', () => {
    const source = fileURLToPath(new URL('../../src', import.meta.url))
    const naming = readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter(name => name.endsWith('.ts'))
      .filter(name => name !== join('profiles', 'issues.ts') && name !== join('profiles', 'coded.ts'))
      .filter(name => readFileSync(join(source, name), 'utf8').includes('verification.failed'))
    expect(naming).toEqual([])
  })
})
