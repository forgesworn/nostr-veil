/**
 * Partial threshold — only 3 of 5 members contribute
 *
 * Run: npx tsx examples/partial-threshold.ts
 */
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  createTrustCircle,
  contributeAssertion,
  aggregateContributions,
  verifyProof,
} from '../src/index.js'

// 5 members
const keys = Array.from({ length: 5 }, (_, i) => {
  const priv = (i + 1).toString(16).padStart(2, '0').repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})

const circle = createTrustCircle(keys.map(k => k.pub))
const subject = 'ee'.repeat(32)

// Only first 3 contribute
const contributions = keys.slice(0, 3).map((k, i) => {
  const idx = circle.members.indexOf(k.pub)
  return contributeAssertion(circle, subject, { rank: 75 + i * 5 }, k.priv, idx)
})

const event = aggregateContributions(circle, subject, contributions)
const proof = verifyProof(event)

console.log(`Circle: ${circle.size} members`)
console.log(`Contributors: ${proof.threshold}`)
console.log(`Distinct signers: ${proof.distinctSigners}`)
console.log(`Valid: ${proof.valid}`)
console.log(`\nAny NIP-85 client reads the score. Veil-aware clients verify the proof.`)
