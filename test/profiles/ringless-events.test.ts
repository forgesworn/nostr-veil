import { describe, expect, it } from 'vitest'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  computeCircleId,
  contributeAssertion,
  createCircleManifest,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  explainVerificationIssue,
  signEvent,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { EventTemplate } from '../../src/index.js'

// A circle control that passes says the assertion came from a circle the
// deployment accepts. An event with no veil-ring tag names no circle, so it
// came from none that the deployment accepts, and its circle check fails as
// its proof does.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const UNACCEPTED = 'event[0] circle is not accepted by deployment policy'

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
const template = (event: EventTemplate): EventTemplate => ({ kind: event.kind, tags: event.tags, content: event.content, created_at: event.created_at })
const withoutRing = (event: EventTemplate): EventTemplate => ({ ...template(event), tags: event.tags.filter(tag => tag[0] !== 'veil-ring') })
const signed = (event: EventTemplate) => signEvent(template(event), PUBLISHER_KEY)

function production(events: unknown, policy: unknown, now = NOW) {
  const bundle = createSignedDeploymentBundle(policy as never, {
    expiresAt: now + 600, id: 'ringless', issuedAt: now - 10, privateKey: OPERATOR_KEY,
  })
  const result = verifyProductionDeployment(events as never, bundle, { now, trustedPublishers: [bundle.signer] })
  const report = createProductionDecisionReport(result)
  return {
    result,
    unaccepted: result.issues.filter(issue => issue.code === 'circle.unaccepted').map(issue => issue.message),
    control: (id: string) => report.controls.find(item => item.id === id),
  }
}

const policy = createDeploymentPolicy(profile, { acceptedCircleIds: [circle.circleId], expectedSubject: subject, requireNostrSignature: true })

describe('an event with no veil-ring tag', () => {
  it('is not from a circle the deployment accepts, so the circle control fails', () => {
    const run = production(signed(withoutRing(proof)), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.unaccepted).toEqual([UNACCEPTED])
    expect(run.control('circle-policy')?.status).toBe('fail')
    expect(run.control('proof-threshold')?.status).toBe('fail')
  })

  // The verifier drops a tag whose elements are not all strings, so a ring of
  // numbers is no ring at all
  it('is not from a circle the deployment accepts when its ring tag is malformed either', () => {
    const numbers = { ...template(proof), tags: proof.tags.map(tag => tag[0] === 'veil-ring' ? ['veil-ring', ...tag.slice(1).map((_, index) => index)] : tag) }
    const run = production(signed(numbers as never), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.unaccepted).toEqual([UNACCEPTED])
    expect(run.control('circle-policy')?.status).toBe('fail')
  })

  describe('in a federation', () => {
    const now = moderationEvents[0].created_at ?? NOW
    const ringOf = (event: EventTemplate) => event.tags.find(tag => tag[0] === 'veil-ring')!.slice(1)
    const federation = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
      acceptedCircleIds: moderationEvents.map(event => computeCircleId(ringOf(event))),
      expectedSubject: moderationEvents[0].tags.find(tag => tag[0] === 'd')![1],
      requireNostrSignature: true,
    })

    // A guard on the fixture, which holds on the parent too
    it('passes the circle control as published', () => {
      const run = production(moderationEvents.map(signed), federation, now)
      expect(run.result.decision).toBe('accept')
      expect(run.control('circle-policy')?.status).toBe('pass')
    })

    it('is not from a circle the deployment accepts either', () => {
      const run = production(moderationEvents.map((event, index) => signed(index === 0 ? withoutRing(event) : event)), federation, now)
      expect(run.result.decision).toBe('reject')
      expect(run.unaccepted).toEqual([UNACCEPTED])
      expect(run.control('circle-policy')?.status).toBe('fail')
    })

    it('names no circle when its ring\'s members are joined into one', () => {
      const joined = (event: EventTemplate) => ({ ...template(event), tags: event.tags.map(tag => tag[0] === 'veil-ring' ? ['veil-ring', tag.slice(1).join(':')] : tag) })
      const run = production(moderationEvents.map((event, index) => signed(index === 0 ? joined(event) : event)), federation, now)
      expect(run.result.decision).toBe('reject')
      expect(run.unaccepted).toEqual([UNACCEPTED])
      expect(run.control('circle-policy')?.status).toBe('fail')
    })
  })

  it('is explained in words that fit an event naming no circle', () => {
    expect(explainVerificationIssue('circle.unaccepted')).toMatchObject({
      summary: 'The assertion does not name a circle this deployment accepts.',
      remediation: 'Reject it. If it names a circle, governance can review that circle and add its manifest or circle id to the deployment policy.',
    })
  })
})

// The proof verifier accepts a ring only as one tag of two or more member
// keys in sorted order, and rejects any other. The circle id joins the members
// with ':', so a ring whose members were joined hashes as the circle they make.
describe('an event whose ring is not in the shape the proof verifier accepts', () => {
  const ringTag = proof.tags.find(tag => tag[0] === 'veil-ring')!
  const keys = ringTag.slice(1)
  const withRings = (...rings: string[][]): EventTemplate => ({
    ...template(proof), tags: [...proof.tags.filter(tag => tag[0] !== 'veil-ring'), ...rings],
  })

  it.each([
    ['its members joined into one', withRings(['veil-ring', keys.join(':')])],
    ['two of its members joined', withRings(['veil-ring', `${keys[0]}:${keys[1]}`, ...keys.slice(2)])],
    ['a second ring tag after the accepted one', withRings(ringTag, ['veil-ring', ...keys.slice(0, 2)])],
    // The proof verifier sees the event as given, with both ring tags
    ['a second ring tag that cannot be read', withRings(ringTag, ['veil-ring', keys[0], 7 as never])],
  ] as Array<[string, EventTemplate]>)('names no circle, with %s', (_label, event) => {
    const run = production(signed(event), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.result.deployment.profileVerification.events[0].circleId).toBeNull()
    expect(run.unaccepted).toEqual([UNACCEPTED])
    expect(run.control('circle-policy')?.status).toBe('fail')
  })

  // No accepted circle hashes as these do by chance, so the deployment is told
  // to accept the id each ring hashes to
  const lettered = keys.findIndex(key => /[a-f]/u.test(key))
  it.each([
    ['one member', [keys[0]]],
    ['its members out of order', [keys[1], keys[0], keys[2]]],
    ['a member given twice', [keys[0], keys[1], keys[1]]],
    ['a member in upper case', keys.map((key, index) => index === lettered ? key.toUpperCase() : key).sort()],
    ['a member of 62 hex digits', [keys[0].slice(0, 62), ...keys.slice(1)].sort()],
  ] as Array<[string, string[]]>)('names no circle with %s, even where the id it hashes to is accepted', (_label, ring) => {
    const accepting = createDeploymentPolicy(profile, { acceptedCircleIds: [computeCircleId(ring)], expectedSubject: subject, requireNostrSignature: true })
    const run = production(signed(withRings(['veil-ring', ...ring])), accepting)
    expect(run.result.decision).toBe('reject')
    expect(run.unaccepted).toEqual([UNACCEPTED])
    expect(run.control('circle-policy')?.status).toBe('fail')
  })

  // A guard, which holds on the parent too: a tag that cannot be read leaves
  // the ring as it is, and the report fails the circle control for an
  // assertion too malformed to read
  it('names its circle when another tag cannot be read', () => {
    const run = production(signed({ ...template(proof), tags: [...proof.tags, ['x', 7] as never] }), policy)
    expect(run.result.decision).toBe('reject')
    expect(run.result.deployment.profileVerification.events[0].circleId).toBe(circle.circleId)
    expect(run.unaccepted).toEqual([])
    expect(run.control('circle-policy')).toMatchObject({ status: 'fail', summary: 'An assertion is too malformed to read, so this could not be checked.' })
  })

  // A guard, which holds on the parent too: the size of a ring is a limit of
  // the proof verifier, which fails the proof, and the deployment may accept
  // the circle
  it('names its circle when it has more members than the proof verifier allows', () => {
    const large = Array.from({ length: 1001 }, (_, index) => index.toString(16).padStart(64, '0'))
    const accepting = createDeploymentPolicy(profile, { acceptedCircleIds: [computeCircleId(large)], expectedSubject: subject, requireNostrSignature: true })
    const run = production(signed(withRings(['veil-ring', ...large])), accepting)
    expect(run.result.decision).toBe('reject')
    expect(run.result.deployment.profileVerification.events[0].circleId).toBe(computeCircleId(large))
    expect(run.unaccepted).toEqual([])
    expect(run.control('circle-policy')?.status).toBe('pass')
    expect(run.control('proof-threshold')?.status).toBe('fail')
  })

  it('names no circle through circle manifests either', () => {
    const manifest = JSON.parse(JSON.stringify(createCircleManifest({
      issuedAt: NOW - 10, expiresAt: NOW + 600, members: [...circle.members], name: 'Reviewers', profileIds: [profile.id], purpose: 'Probe',
    })))
    const viaManifests = createDeploymentPolicy(profile, { expectedSubject: subject, circleManifests: [manifest], now: NOW, requireNostrSignature: true })
    const run = production(signed(withRings(['veil-ring', keys.join(':')])), viaManifests)
    expect(run.unaccepted).toEqual([UNACCEPTED])
    expect(run.control('circle-policy')?.status).toBe('fail')
  })
})

describe('the circle control, when it fails', () => {
  // A malformed manifest beside the well-formed one that supplied the circle:
  // the assertion's own circle is accepted, and a manifest of the deployment
  // is at fault
  it('does not say the assertion used a circle that is at fault', () => {
    const good = JSON.parse(JSON.stringify(createCircleManifest({
      issuedAt: NOW - 10, expiresAt: NOW + 600, members: [...circle.members], name: 'Reviewers', profileIds: [profile.id], purpose: 'Probe',
    })))
    const other = JSON.parse(JSON.stringify(createCircleManifest({
      issuedAt: NOW - 10, expiresAt: NOW + 600, members: ['66', '77', '88'].map(byte => pubkey(byte.repeat(32))), name: 'Others', profileIds: [profile.id], purpose: 'Probe',
    })))
    const viaManifests = {
      ...JSON.parse(JSON.stringify(createDeploymentPolicy(profile, { expectedSubject: subject, circleManifests: [good], now: NOW, requireNostrSignature: true }))),
      circleManifests: [good, { ...other, version: 2 }],
    }
    const run = production(signed(proof), viaManifests)
    expect(run.control('circle-policy')).toMatchObject({
      status: 'fail',
      summary: 'The assertion names no circle the deployment accepts, or the deployment\'s accepted circles or circle manifests are missing, malformed, expired, not yet valid, revoked, superseded, or not allowed for this profile.',
    })
  })

  /** The circle control at a time that cannot be compared */
  function atNoTime(event: unknown, at: unknown) {
    const bundle = createSignedDeploymentBundle(at as never, { expiresAt: NOW + 600, id: 'no-time', issuedAt: NOW - 10, privateKey: OPERATOR_KEY })
    const result = verifyProductionDeployment(event as never, bundle, { now: Number.NaN, trustedPublishers: [bundle.signer] })
    return createProductionDecisionReport(result).controls.find(item => item.id === 'circle-policy')
  }

  // A guard, which holds on the parent too: of two reasons the report knows,
  // the time that cannot be compared comes first
  it('says that no manifest was dated before that the assertion cannot be read, where both hold', () => {
    const manifest = JSON.parse(JSON.stringify(createCircleManifest({
      issuedAt: NOW - 10, expiresAt: NOW + 600, members: [...circle.members], name: 'Reviewers', profileIds: [profile.id], purpose: 'Probe',
    })))
    const viaManifests = createDeploymentPolicy(profile, { expectedSubject: subject, circleManifests: [manifest], now: NOW, requireNostrSignature: true })
    expect(atNoTime(signed({ ...template(proof), tags: [...proof.tags, ['x', 7] as never] }), viaManifests)).toMatchObject({
      status: 'fail', summary: 'The verification time cannot be compared, so no circle manifest was checked for expiry.',
    })
  })

  // A guard, which holds on the parent too: with no manifest to date, the
  // circle check compares no time, and passes as at any other time
  it('passes at a time that cannot be compared where no circle manifest is dated', () => {
    expect(atNoTime(signed(proof), policy)).toMatchObject({
      status: 'pass', summary: 'The assertion was produced by a circle accepted by the deployment policy.',
    })
  })
})
