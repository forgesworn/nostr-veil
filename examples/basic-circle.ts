/**
 * Basic trust circle — 3 anonymous members score a subject
 *
 * Run: npx tsx examples/basic-circle.ts
 */
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  createTrustCircle,
  contributeAssertion,
  aggregateContributions,
  verifyProof,
  signEvent,
} from 'nostr-veil'

// Generate 3 keypairs
const keys = ['aa', 'bb', 'cc'].map(b => {
  const priv = b.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})

const subject = 'dd'.repeat(32)

// 1. Create the circle
const circle = createTrustCircle(keys.map(k => k.pub))
console.log(`Circle created: ${circle.size} members, ID: ${circle.circleId.slice(0, 16)}...`)

// 2. Each member contributes anonymously
const contributions = keys.map((k, i) => {
  const idx = circle.members.indexOf(k.pub)
  return contributeAssertion(circle, subject, { rank: 70 + i * 10 }, k.priv, idx)
})
console.log(`${contributions.length} contributions collected`)

// 3. Aggregate into a NIP-85 event
const event = aggregateContributions(circle, subject, contributions)
console.log(`Aggregated: kind ${event.kind}, rank ${event.tags.find(t => t[0] === 'rank')?.[1]}`)

// 4. Verify
const proof = verifyProof(event)
console.log(`Verified: ${proof.valid ? 'VALID' : 'INVALID'} — ${proof.distinctSigners} of ${proof.circleSize} signers`)

// 5. Sign and publish
const signed = signEvent(event, keys[0].priv)
console.log(`Signed event: ${signed.id.slice(0, 16)}...`)
