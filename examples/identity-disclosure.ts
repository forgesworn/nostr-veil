/**
 * Identity disclosure — prove two personas share a master key
 *
 * Run: npx tsx examples/identity-disclosure.ts
 */
import { fromNsec } from 'nsec-tree/core'
import { verifyProof as verifyLinkageProof } from 'nsec-tree/proof'
import { bytesToHex } from '@noble/hashes/utils.js'
import {
  createUserPersona,
  proveCommonOwnership,
  buildDisclosureEvent,
  signEvent,
} from 'nostr-veil'

// Two personas derived from the same root nsec
const testNsec = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw'

const journalist = createUserPersona(testNsec, 'journalist')
const anonymous = createUserPersona(testNsec, 'anonymous')

console.log(`Journalist persona: ${journalist.persona.identity.npub.slice(0, 20)}...`)
console.log(`Anonymous persona:  ${anonymous.persona.identity.npub.slice(0, 20)}...`)
console.log(`\nThese look like completely different identities.\n`)

// Prove common ownership (blind mode — hides derivation path)
const root = fromNsec(testNsec)
const [proofA, proofB] = proveCommonOwnership(
  root,
  journalist.persona.identity,
  anonymous.persona.identity,
  'blind'
)

console.log(`Blind linkage proof:`)
console.log(`  Master pubkey: ${proofA.masterPubkey.slice(0, 16)}...`)
console.log(`  Child A:       ${proofA.childPubkey.slice(0, 16)}...`)
console.log(`  Child B:       ${proofB.childPubkey.slice(0, 16)}...`)
console.log(`  Purpose shown: ${proofA.purpose ?? 'hidden'}`)

// Verify both proofs
const validA = verifyLinkageProof(proofA)
const validB = verifyLinkageProof(proofB)
console.log(`\n  Proof A valid: ${validA}`)
console.log(`  Proof B valid: ${validB}`)
console.log(`  Same master:   ${proofA.masterPubkey === proofB.masterPubkey}`)

// Build and sign disclosure event
// Note: persona privateKey is Uint8Array — convert to hex for signEvent
const event = buildDisclosureEvent([proofA, proofB])
const signed = signEvent(event, bytesToHex(journalist.persona.identity.privateKey))
console.log(`\nDisclosure event: kind ${signed.kind}, id: ${signed.id.slice(0, 16)}...`)

// Cleanup
root.destroy()
journalist.destroy()
anonymous.destroy()
