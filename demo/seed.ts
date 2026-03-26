#!/usr/bin/env npx tsx
/**
 * Demo seeding script — publish NIP-85 assertions and ring endorsements to real relays.
 *
 * Derives 8 test identities from a hardcoded nsec via nsec-tree, builds standard
 * NIP-85 user assertions between them, creates a ring-endorsed assertion from a
 * trust circle, and publishes everything to the configured relays.
 *
 * Usage:
 *   npx tsx demo/seed.ts                     # default relays
 *   npx tsx demo/seed.ts wss://my.relay.com  # custom relay(s)
 *   npx tsx demo/seed.ts --dry-run           # print events without publishing
 */
import { fromNsec, derive } from 'nsec-tree'
import { bytesToHex } from '@noble/hashes/utils.js'
import { signEvent } from '../src/signing.js'
import { buildUserAssertion } from '../src/nip85/builders.js'
import { createTrustCircle } from '../src/proof/circle.js'
import { contributeAssertion } from '../src/proof/contribute.js'
import { aggregateContributions } from '../src/proof/aggregate.js'
import { verifyProof } from '../src/proof/verify.js'
import type { SignedEvent } from '../src/signing.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol']
const ROOT_NSEC = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw'

const MEMBER_NAMES = [
  'elena-novak',
  'marcus-chen',
  'amira-hassan',
  'liam-obrien',
  'yuki-tanaka',
  'fatima-reyes',
  'nikolai-petrov',
  'sarah-okafor',
]

// The anonymous source being evaluated
const SOURCE_LABEL = 'veil:source:anonymous'

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const relayArgs = args.filter(a => a.startsWith('wss://'))
const relays = relayArgs.length > 0 ? relayArgs : DEFAULT_RELAYS

// ---------------------------------------------------------------------------
// Step 1: Derive 8 identities from a single nsec
// ---------------------------------------------------------------------------

interface Identity {
  name: string
  privateKeyHex: string
  publicKeyHex: string
}

function deriveIdentities(): Identity[] {
  const root = fromNsec(ROOT_NSEC)
  const identities: Identity[] = []

  for (let i = 0; i < MEMBER_NAMES.length; i++) {
    const child = derive(root, `veil:demo:${MEMBER_NAMES[i]}`, 0)
    identities.push({
      name: MEMBER_NAMES[i],
      privateKeyHex: bytesToHex(child.privateKey),
      publicKeyHex: bytesToHex(child.publicKey),
    })
  }

  // Also derive the source identity
  const source = derive(root, SOURCE_LABEL, 0)
  const sourceIdentity: Identity = {
    name: 'anonymous-source',
    privateKeyHex: bytesToHex(source.privateKey),
    publicKeyHex: bytesToHex(source.publicKey),
  }

  root.destroy()
  return [...identities, sourceIdentity]
}

console.log('Deriving 8 member identities + 1 source from nsec-tree...')
const identities = deriveIdentities()
const members = identities.slice(0, 8)
const source = identities[8]

console.log(`  Source: ${source.publicKeyHex.slice(0, 16)}...`)
for (const m of members) {
  console.log(`  ${m.name}: ${m.publicKeyHex.slice(0, 16)}...`)
}

// ---------------------------------------------------------------------------
// Step 2: Build NIP-85 user assertions (each member rates the source)
// ---------------------------------------------------------------------------

console.log('\nBuilding NIP-85 user assertions...')
const signedEvents: SignedEvent[] = []

const RANK_SCORES = [85, 78, 92, 70, 88, 65, 80, 73]
const FOLLOWER_COUNTS = [1200, 800, 2500, 450, 1800, 350, 1100, 600]

for (let i = 0; i < members.length; i++) {
  const template = buildUserAssertion(source.publicKeyHex, {
    rank: RANK_SCORES[i],
    followers: FOLLOWER_COUNTS[i],
  })
  const signed = signEvent(template, members[i].privateKeyHex)
  signedEvents.push(signed)
  console.log(`  ${members[i].name} rates source: rank=${RANK_SCORES[i]}, followers=${FOLLOWER_COUNTS[i]}`)
}

// Also add some cross-member assertions for a richer graph
const CROSS_EDGES: [number, number, number][] = [
  [0, 1, 82], [0, 2, 75], [1, 3, 68],
  [2, 0, 90], [3, 4, 77], [4, 5, 63],
  [5, 6, 71], [6, 7, 84], [7, 0, 79],
]

console.log('\nBuilding cross-member assertions...')
for (const [from, to, rank] of CROSS_EDGES) {
  const template = buildUserAssertion(members[to].publicKeyHex, { rank })
  const signed = signEvent(template, members[from].privateKeyHex)
  signedEvents.push(signed)
  console.log(`  ${members[from].name} -> ${members[to].name}: rank=${rank}`)
}

// ---------------------------------------------------------------------------
// Step 3: Create ring endorsement (trust circle of all 8 members)
// ---------------------------------------------------------------------------

console.log('\nCreating trust circle and ring endorsement...')
const pubkeys = members.map(m => m.publicKeyHex)
const circle = createTrustCircle(pubkeys)
console.log(`  Circle: ${circle.size} members, ID: ${circle.circleId.slice(0, 16)}...`)

// 5 of 8 members contribute anonymous endorsements
const RING_CONTRIBUTORS = 5
const contributions: ReturnType<typeof contributeAssertion>[] = []
for (let i = 0; i < RING_CONTRIBUTORS; i++) {
  const memberIndex = circle.members.indexOf(members[i].publicKeyHex)
  const contribution = contributeAssertion(
    circle,
    source.publicKeyHex,
    { rank: 80 + i * 3 },
    members[i].privateKeyHex,
    memberIndex,
  )
  contributions.push(contribution)
  console.log(`  ${members[i].name} contributes anonymously: rank=${80 + i * 3}`)
}

const aggregated = aggregateContributions(circle, source.publicKeyHex, contributions)
const proof = verifyProof(aggregated)
console.log(`  Aggregated: ${proof.distinctSigners}/${circle.size} signers, valid=${proof.valid}`)

// Sign the aggregated ring-endorsed event with the first member's key (publisher role)
const ringEvent = signEvent(aggregated, members[0].privateKeyHex)
signedEvents.push(ringEvent)

// ---------------------------------------------------------------------------
// Step 4: Publish to relays
// ---------------------------------------------------------------------------

console.log(`\n${signedEvents.length} events ready.`)

if (dryRun) {
  console.log('\n--dry-run: printing events to stdout\n')
  for (const event of signedEvents) {
    console.log(JSON.stringify(event))
  }
  process.exit(0)
}

console.log(`\nPublishing to ${relays.length} relay(s): ${relays.join(', ')}`)

async function publishToRelay(url: string, events: SignedEvent[]): Promise<{ ok: number; fail: number }> {
  return new Promise((resolve) => {
    let ok = 0
    let fail = 0
    let pending = events.length
    let connected = false

    const ws = new WebSocket(url)
    const timeout = setTimeout(() => {
      if (!connected) {
        console.error(`  [${url}] connection timeout`)
        ws.close()
        resolve({ ok: 0, fail: events.length })
      }
    }, 10_000)

    ws.addEventListener('open', () => {
      connected = true
      clearTimeout(timeout)
      for (const event of events) {
        ws.send(JSON.stringify(['EVENT', event]))
      }
    })

    ws.addEventListener('message', (msg) => {
      try {
        const data = JSON.parse(String(msg.data))
        if (data[0] === 'OK') {
          if (data[2] === true) {
            ok++
          } else {
            fail++
            console.error(`  [${url}] rejected: ${data[3] ?? 'unknown reason'}`)
          }
          pending--
          if (pending <= 0) {
            ws.close()
            resolve({ ok, fail })
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    })

    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      console.error(`  [${url}] WebSocket error`)
      resolve({ ok, fail: events.length - ok })
    })

    ws.addEventListener('close', () => {
      clearTimeout(timeout)
      if (pending > 0) {
        resolve({ ok, fail: events.length - ok })
      }
    })

    // Safety timeout — don't hang forever waiting for OK responses
    setTimeout(() => {
      if (pending > 0) {
        console.error(`  [${url}] timed out waiting for ${pending} OK responses`)
        ws.close()
        resolve({ ok, fail: events.length - ok })
      }
    }, 30_000)
  })
}

async function main() {
  const results = await Promise.all(
    relays.map(url => publishToRelay(url, signedEvents)),
  )

  console.log('\nResults:')
  for (let i = 0; i < relays.length; i++) {
    const { ok, fail } = results[i]
    console.log(`  ${relays[i]}: ${ok} accepted, ${fail} rejected/failed`)
  }

  const totalOk = results.reduce((sum, r) => sum + r.ok, 0)
  console.log(`\nDone. ${totalOk} events published across ${relays.length} relay(s).`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
