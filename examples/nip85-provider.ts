/**
 * NIP-85 provider — build assertion events and provider declarations
 *
 * Run: npx tsx examples/nip85-provider.ts
 */
import {
  buildUserAssertion,
  buildProviderDeclaration,
  parseAssertion,
  validateAssertion,
  signEvent,
} from 'nostr-veil'

const providerKey = 'aa'.repeat(32)
const subjectPubkey = 'bb'.repeat(32)

// Build a user assertion (kind 30382)
const assertion = buildUserAssertion(subjectPubkey, {
  rank: 82,
  followers: 1450,
  post_cnt: 312,
})

console.log('User assertion (kind 30382):')
console.log(`  Subject: ${assertion.tags.find(t => t[0] === 'd')?.[1]?.slice(0, 16)}...`)
console.log(`  Rank: ${assertion.tags.find(t => t[0] === 'rank')?.[1]}`)
console.log(`  Followers: ${assertion.tags.find(t => t[0] === 'followers')?.[1]}`)

// Validate
const validation = validateAssertion(assertion)
console.log(`  Valid: ${validation.valid}`)

// Sign and inspect
const signed = signEvent(assertion, providerKey)
console.log(`  Event ID: ${signed.id.slice(0, 16)}...`)

// Parse it back
const parsed = parseAssertion(assertion)
console.log(`\nParsed back:`)
console.log(`  Kind: ${parsed.kind}`)
console.log(`  Metrics:`, parsed.metrics)

// Build a provider declaration (kind 10040)
const declaration = buildProviderDeclaration([
  { kind: 30382, metric: 'rank', servicePubkey: providerKey, relayHint: 'wss://relay.example.com' },
  { kind: 30382, metric: 'followers', servicePubkey: providerKey, relayHint: 'wss://relay.example.com' },
])
console.log(`\nProvider declaration (kind 10040):`)
console.log(`  Tags: ${declaration.tags.length} provider entries`)
declaration.tags.forEach(t => console.log(`    ${t[0]} → ${t[1].slice(0, 16)}...`))
