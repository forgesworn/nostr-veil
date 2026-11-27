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
  createSignedDeploymentBundle,
  createTrustCircle,
  signEvent,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { EventTemplate, VerificationIssueCode } from '../../src/index.js'

// The legacy classifier reads a code out of a message's words, for a message
// that comes with no record of its code. Two messages of the proof verifier
// name a circle's members or its id, and were read as a fault in a circle
// manifest, which they are not.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)

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
const template = (event: EventTemplate): EventTemplate => ({ kind: event.kind, tags: event.tags, content: event.content, created_at: event.created_at })
const signed = (event: EventTemplate) => signEvent(template(event), PUBLISHER_KEY)

/** One member left in the ring */
const oneMember = (event: EventTemplate): EventTemplate => ({
  ...template(event), tags: event.tags.map(tag => tag[0] === 'veil-ring' ? tag.slice(0, 2) : tag),
})
/** Each signature's signed message names another circle */
const otherCircleId = (event: EventTemplate): EventTemplate => ({
  ...template(event),
  tags: event.tags.map((tag) => {
    if (tag[0] !== 'veil-sig') return tag
    const signature = JSON.parse(tag[1]) as { message: string }
    const message = JSON.parse(signature.message) as Record<string, unknown>
    return ['veil-sig', JSON.stringify({ ...signature, message: JSON.stringify({ ...message, circleId: 'ab'.repeat(32) }) }), ...tag.slice(2)]
  }),
})

function raised(events: unknown, policy: unknown, now = NOW) {
  const bundle = createSignedDeploymentBundle(policy as never, {
    expiresAt: now + 600, id: 'classifier', issuedAt: now - 10, privateKey: OPERATOR_KEY,
  })
  return verifyProductionDeployment(events as never, bundle, { now, trustedPublishers: [bundle.signer] }).issues
}

const MESSAGES: Array<[string, VerificationIssueCode]> = [
  ['event[0] proof: veil-ring requires at least 2 members', 'proof.invalid'],
  ['event[1] proof: Signature at index 2 signed message circleId mismatch', 'proof.invalid'],
  ['federation: event[0]: veil-ring requires at least 2 members', 'federation.invalid'],
  ['federation: event[1]: Signature at index 2 signed message circleId mismatch', 'federation.invalid'],
]

describe('the legacy classifier, given a proof message that names a circle\'s members or id', () => {
  it.each(MESSAGES)('reads %s as %s', (message, code) => {
    expect(classifyVerificationError(message).code).toBe(code)
  })

  // Guards, which hold on the parent too, where no rule reads these whole
  it.each(MESSAGES)('does not read %s as its code with text before or after it', (message, code) => {
    expect(classifyVerificationError(`x ${message}`).code).not.toBe(code)
    expect(classifyVerificationError(`${message} x`).code).not.toBe(code)
  })

  describe('as a run raises it', () => {
    const misread = (issues: ReturnType<typeof raised>) => issues
      .filter(issue => /members|circleId/u.test(issue.message))
      .map(issue => ({ message: issue.message, raised: issue.code, read: classifyVerificationError(issue.message).code }))
      .filter(item => item.read !== item.raised)

    const policy = createDeploymentPolicy(USER_REPUTATION_ABUSE_REPORTING_PROFILE, {
      acceptedCircleIds: [circle.circleId], expectedSubject: subject, requireNostrSignature: true,
    })
    const now = moderationEvents[0].created_at ?? NOW
    const federation = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
      acceptedCircleIds: moderationEvents.map(event => computeCircleId(event.tags.find(tag => tag[0] === 'veil-ring')!.slice(1))),
      expectedSubject: moderationEvents[0].tags.find(tag => tag[0] === 'd')![1],
      requireNostrSignature: true,
    })

    it.each([
      ['with one member left in the ring', oneMember],
      ['with each signature naming another circle', otherCircleId],
    ] as Array<[string, (event: EventTemplate) => EventTemplate]>)('reads each such error as the code it is raised with, %s', (_label, change) => {
      const alone = raised(signed(change(proof)), policy)
      const inFederation = raised(moderationEvents.map((event, index) => signed(index === 0 ? change(event) : event)), federation, now)
      expect(alone.some(issue => /members|circleId/u.test(issue.message))).toBe(true)
      expect(inFederation.some(issue => issue.message.startsWith('federation: ') && /members|circleId/u.test(issue.message))).toBe(true)
      expect(misread(alone)).toEqual([])
      expect(misread(inFederation)).toEqual([])
    })
  })
})
