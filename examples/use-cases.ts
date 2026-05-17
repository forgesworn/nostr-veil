/**
 * Concrete use-case shapes for nostr-veil.
 *
 * Run: npx tsx examples/use-cases.ts
 */
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  aggregateAddressableContributions,
  aggregateContributions,
  aggregateEventContributions,
  aggregateIdentifierContributions,
  contributeAddressableAssertion,
  contributeAssertion,
  contributeEventAssertion,
  contributeIdentifierAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyFederation,
  verifyProof,
} from 'nostr-veil'
import type { TrustCircle } from 'nostr-veil'

type AssertionTemplate = { kind: number; tags: string[][]; content: string }

const keys = ['11', '22', '33', '44'].map(b => {
  const priv = b.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})

const circle = createTrustCircle(keys.slice(0, 3).map(k => k.pub))
const proofVersion = 'v2' as const
const externalProfileKind = '0' // Placeholder app-private namespace for kind 30385 examples.

function circleKeys(target: TrustCircle) {
  return keys.filter(k => target.members.includes(k.pub))
}

function memberIndex(target: TrustCircle, pubkey: string): number {
  const index = target.members.indexOf(pubkey)
  if (index === -1) throw new Error('key is not a member of this circle')
  return index
}

function userAssertion(
  subject: string,
  metricsFor: (index: number) => Record<string, number>,
  target = circle,
): AssertionTemplate {
  const contributions = circleKeys(target).map((k, i) =>
    contributeAssertion(
      target,
      subject,
      metricsFor(i),
      k.priv,
      memberIndex(target, k.pub),
      { proofVersion },
    ),
  )
  return aggregateContributions(target, subject, contributions, { proofVersion })
}

function eventAssertion(
  eventId: string,
  metricsFor: (index: number) => Record<string, number>,
): AssertionTemplate {
  const contributions = circleKeys(circle).map((k, i) =>
    contributeEventAssertion(
      circle,
      eventId,
      metricsFor(i),
      k.priv,
      memberIndex(circle, k.pub),
      { proofVersion },
    ),
  )
  return aggregateEventContributions(circle, eventId, contributions, { proofVersion })
}

function addressableAssertion(
  address: string,
  metricsFor: (index: number) => Record<string, number>,
): AssertionTemplate {
  const contributions = circleKeys(circle).map((k, i) =>
    contributeAddressableAssertion(
      circle,
      address,
      metricsFor(i),
      k.priv,
      memberIndex(circle, k.pub),
      { proofVersion },
    ),
  )
  return aggregateAddressableContributions(circle, address, contributions, { proofVersion })
}

function identifierAssertion(
  identifier: string,
  kTag: string,
  metricsFor: (index: number) => Record<string, number>,
): AssertionTemplate {
  const contributions = circleKeys(circle).map((k, i) =>
    contributeIdentifierAssertion(
      circle,
      identifier,
      kTag,
      metricsFor(i),
      k.priv,
      memberIndex(circle, k.pub),
      { proofVersion },
    ),
  )
  return aggregateIdentifierContributions(circle, identifier, kTag, contributions, { proofVersion })
}

function subjectTag(assertion: AssertionTemplate): string {
  const tag = assertion.tags.find(t => ['p', 'e', 'a', 'k'].includes(t[0]))
  const dTag = assertion.tags.find(t => t[0] === 'd')
  return `${tag?.[0] ?? 'd'}=${tag?.[1] ?? dTag?.[1] ?? 'unknown'}`
}

function short(value: string): string {
  return value.length <= 36 ? value : `${value.slice(0, 18)}...${value.slice(-12)}`
}

const subjectPubkey = keys[3].pub
const authorPubkey = keys[0].pub

const supportedCases = [
  {
    name: 'User reputation and abuse reporting',
    assertion: userAssertion(subjectPubkey, i => ({ rank: 24 + i * 3, reports_cnt_recd: i + 1 })),
  },
  {
    name: 'Source corroboration',
    assertion: userAssertion(subjectPubkey, i => ({ rank: 78 + i * 2 })),
  },
  {
    name: 'Event and claim verification',
    assertion: eventAssertion('aa'.repeat(32), i => ({ rank: 70 + i * 4, reaction_cnt: i + 1 })),
  },
  {
    name: 'Article, research, and long-form review',
    assertion: addressableAssertion(`30023:${authorPubkey}:paper-1`, i => ({ rank: 82 + i * 2 })),
  },
  {
    name: 'Relay and service reputation',
    assertion: identifierAssertion('relay:wss://relay.example.com', '10002', i => ({ rank: 74 + i * 3 })),
  },
  {
    name: 'Release, package, and maintainer reputation',
    assertion: identifierAssertion('npm:nostr-veil@0.14.0', externalProfileKind, i => ({ rank: 86 + i })),
  },
  {
    name: 'NIP-05 and domain trust',
    assertion: identifierAssertion('nip05:alice@example.com', externalProfileKind, i => ({ rank: 80 + i * 2 })),
  },
  {
    name: 'Community list, labeler, and moderation-list reputation',
    assertion: addressableAssertion(`30000:${authorPubkey}:trusted-relays`, i => ({ rank: 76 + i * 3 })),
  },
  {
    name: 'Grant, funding, and proposal review',
    assertion: eventAssertion('bb'.repeat(32), i => ({ rank: 68 + i * 5 })),
  },
  {
    name: 'Vendor and marketplace signals',
    assertion: identifierAssertion('vendor:market.example:alice', externalProfileKind, i => ({ rank: 62 + i * 4 })),
  },
  {
    name: 'Privacy-preserving onboarding',
    assertion: userAssertion(subjectPubkey, i => ({ rank: 88 + i })),
  },
]

for (const useCase of supportedCases) {
  const syntax = validateAssertionStrict(useCase.assertion)
  const proof = verifyProof(useCase.assertion, { requireProofVersion: 'v2' })
  console.log(
    `${useCase.name}: kind ${useCase.assertion.kind}, ${short(subjectTag(useCase.assertion))}, ` +
    `strict=${syntax.valid ? 'yes' : 'no'}, proof=${proof.valid ? 'yes' : 'no'}`,
  )
}

const scopedSubject = keys[3].pub
const circleA = createTrustCircle(keys.slice(0, 3).map(k => k.pub), { scope: 'moderation.federation.example' })
const circleB = createTrustCircle(keys.slice(1, 4).map(k => k.pub), { scope: 'moderation.federation.example' })
const circleAEvent = userAssertion(scopedSubject, i => ({ rank: 30 + i * 5 }), circleA)
const circleBEvent = userAssertion(scopedSubject, i => ({ rank: 35 + i * 5 }), circleB)
const federation = verifyFederation([circleAEvent, circleBEvent])

console.log(
  `Federated moderation: circles=${federation.circleCount}, ` +
  `signatures=${federation.totalSignatures}, distinct=${federation.distinctSigners}, ` +
  `proof=${federation.valid ? 'yes' : 'no'}`,
)

console.log('Future profile: anonymous credential co-signing needs a credential or attestation event format.')
console.log('Future profile: anonymous gated access needs a relay/community admission handshake.')
