/**
 * Typed assertions -- event, addressable, and identifier reputation
 *
 * Run: npx tsx examples/typed-assertions.ts
 */
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  aggregateAddressableContributions,
  aggregateEventContributions,
  aggregateIdentifierContributions,
  contributeAddressableAssertion,
  contributeEventAssertion,
  contributeIdentifierAssertion,
  createTrustCircle,
  verifyProof,
} from 'nostr-veil'

const keys = ['11', '22', '33'].map(b => {
  const priv = b.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})
const circle = createTrustCircle(keys.map(k => k.pub))
const proofVersion = 'v2' as const

function eventContributionsFor(eventId: string) {
  return keys.map((k, i) =>
    contributeEventAssertion(
      circle,
      eventId,
      { rank: 80 + i * 5 },
      k.priv,
      circle.members.indexOf(k.pub),
      { proofVersion },
    ),
  )
}

const eventId = 'aa'.repeat(32)
const eventAssertion = aggregateEventContributions(
  circle,
  eventId,
  eventContributionsFor(eventId),
  { proofVersion },
)

const articleAddress = `30023:${keys[0].pub}:article-1`
const articleContributions = keys.map((k, i) =>
  contributeAddressableAssertion(
    circle,
    articleAddress,
    { rank: 80 + i * 5 },
    k.priv,
    circle.members.indexOf(k.pub),
    { proofVersion },
  ),
)
const articleAssertion = aggregateAddressableContributions(
  circle,
  articleAddress,
  articleContributions,
  { proofVersion },
)

const relayIdentifier = 'relay:wss://relay.example.com'
const relayContributions = keys.map((k, i) =>
  contributeIdentifierAssertion(
    circle,
    relayIdentifier,
    '10002',
    { rank: 80 + i * 5 },
    k.priv,
    circle.members.indexOf(k.pub),
    { proofVersion },
  ),
)
const relayAssertion = aggregateIdentifierContributions(
  circle,
  relayIdentifier,
  '10002',
  relayContributions,
  { proofVersion },
)

for (const assertion of [eventAssertion, articleAssertion, relayAssertion]) {
  const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
  const subjectTag = assertion.tags.find(t => ['e', 'a', 'k'].includes(t[0]))
  console.log(`kind ${assertion.kind}, ${subjectTag?.[0]}=${subjectTag?.[1]}: ${proof.valid ? 'VALID' : 'INVALID'}`)
}
