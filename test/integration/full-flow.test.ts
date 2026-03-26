import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

// NIP-85
import { buildUserAssertion } from '../../src/nip85/builders.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'
import type { EventTemplate } from '../../src/nip85/types.js'

// Proof
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion } from '../../src/proof/contribute.js'
import { aggregateContributions } from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'

// Identity
import { createUserPersona } from '../../src/identity/persona.js'
import { proveCommonOwnership, buildDisclosureEvent } from '../../src/identity/disclosure.js'
import { fromNsec } from 'nsec-tree/core'
import { verifyProof as verifyLinkageProof } from 'nsec-tree/proof'

// Scorer
import { buildTrustGraph } from '../../src/scorer/graph.js'
import { computeTrustRank } from '../../src/scorer/rank.js'

// Duress
import { createDuressMonitor } from '../../src/duress/monitor.js'
import { propagateDuressAlert } from '../../src/duress/alert.js'
import { decryptDuressAlert, deriveDuressKey } from 'canary-kit/beacon'

// ---------- deterministic test identities ----------

const privKeyHexes = [
  '0101010101010101010101010101010101010101010101010101010101010101',
  '0202020202020202020202020202020202020202020202020202020202020202',
  '0303030303030303030303030303030303030303030303030303030303030303',
  '0404040404040404040404040404040404040404040404040404040404040404',
  '0505050505050505050505050505050505050505050505050505050505050505',
]

const pubkeys = privKeyHexes.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))

// A subject that is NOT one of the circle members (for standard assertions)
const externalSubject = 'ff'.repeat(32)

// Master nsec for persona derivation
const TEST_NSEC = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw'

describe('derived identity full pipeline', () => {
  const PERSONA_NAMES = ['alice', 'bob', 'carol', 'david', 'eve']
  const handles: ReturnType<typeof createUserPersona>[] = []
  let derivedPubkeys: string[]
  let derivedPrivKeyHexes: string[]
  let circle: ReturnType<typeof createTrustCircle>
  let ringEndorsedEvent: EventTemplate

  it('derives 5 personas from a master nsec', () => {
    for (const name of PERSONA_NAMES) {
      handles.push(createUserPersona(TEST_NSEC, name))
    }

    derivedPubkeys = handles.map(h => bytesToHex(h.persona.identity.publicKey))
    derivedPrivKeyHexes = handles.map(h => bytesToHex(h.persona.identity.privateKey))

    // All personas are unique
    const uniquePubs = new Set(derivedPubkeys)
    expect(uniquePubs.size).toBe(5)

    // Each persona has valid keys
    for (const h of handles) {
      expect(h.persona.identity.npub).toMatch(/^npub1/)
      expect(h.persona.identity.nsec).toMatch(/^nsec1/)
    }
  })

  it('forms a trust circle from derived personas', () => {
    circle = createTrustCircle(derivedPubkeys)
    expect(circle.size).toBe(5)
  })

  it('contributes ring endorsements from derived identities', { timeout: 30_000 }, () => {
    // All 5 derived personas contribute to endorse the external subject
    const contributions = derivedPrivKeyHexes.map((privHex, i) => {
      const memberIndex = circle.members.indexOf(derivedPubkeys[i])
      return contributeAssertion(circle, externalSubject, { rank: 80 + i * 3 }, privHex, memberIndex)
    })

    expect(contributions).toHaveLength(5)
    // Each contribution has a unique key image (no double-signing)
    const keyImages = new Set(contributions.map(c => c.keyImage))
    expect(keyImages.size).toBe(5)

    ringEndorsedEvent = aggregateContributions(circle, externalSubject, contributions)
    expect(ringEndorsedEvent.kind).toBe(NIP85_KINDS.USER)
    expect(ringEndorsedEvent.tags.find(t => t[0] === 'veil-ring')).toBeTruthy()
  })

  it('verifies the ring proof from derived identities', () => {
    const proof = verifyProof(ringEndorsedEvent)
    expect(proof.valid).toBe(true)
    expect(proof.distinctSigners).toBe(5)
    expect(proof.circleSize).toBe(5)
    expect(proof.errors).toHaveLength(0)
  })

  it('builds trust graph and ranks the ring-endorsed subject', () => {
    // Standard assertions from each persona as provider
    const standardEvents: EventTemplate[] = derivedPubkeys.map((pk, i) => ({
      kind: NIP85_KINDS.USER,
      content: '',
      tags: [['d', externalSubject], ['p', pk], ['rank', String(70 + i * 5)]],
    }))

    const graph = buildTrustGraph([...standardEvents, ringEndorsedEvent])
    expect(graph.nodes.size).toBe(1)

    const node = graph.nodes.get(externalSubject)!
    expect(node.endorsements).toBe(5)
    expect(node.ringEndorsements).toBe(1)

    const ranks = computeTrustRank(graph)
    expect(ranks).toHaveLength(1)
    expect(ranks[0].pubkey).toBe(externalSubject)
    expect(ranks[0].ringEndorsements).toBe(1)
  })

  it('proves common ownership between two derived personas', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = handles[0].persona.identity
    const identityB = handles[1].persona.identity
    const [proofA, proofB] = proveCommonOwnership(root, identityA, identityB)

    // Both proofs share the same master pubkey
    expect(proofA.masterPubkey).toBe(proofB.masterPubkey)

    // Both proofs are verifiable
    expect(verifyLinkageProof(proofA)).toBe(true)
    expect(verifyLinkageProof(proofB)).toBe(true)

    // Disclosure event is well-formed
    const disclosureEvent = buildDisclosureEvent([proofA, proofB])
    expect(disclosureEvent.kind).toBe(30078)
    expect(disclosureEvent.tags.find(t => t[0] === 'veil-master')).toBeTruthy()
    expect(disclosureEvent.tags.find(t => t[0] === 'veil-linkage-a')).toBeTruthy()
    expect(disclosureEvent.tags.find(t => t[0] === 'veil-linkage-b')).toBeTruthy()

    root.destroy()
  })

  describe('duress monitoring with derived identities', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('detects missed heartbeat from a derived persona', () => {
      const monitor = createDuressMonitor({ toleranceMs: 100, checkIntervalMs: 50 })
      const duressEvents: Array<{ pubkey: string }> = []
      monitor.on('duress', (e) => duressEvents.push(e))
      monitor.start()

      const activePubkeys = derivedPubkeys.slice(0, 4)
      const missingPubkey = derivedPubkeys[4]

      for (const pk of derivedPubkeys) monitor.heartbeat(pk)

      vi.advanceTimersByTime(80)
      for (const pk of activePubkeys) monitor.heartbeat(pk)

      vi.advanceTimersByTime(30)

      expect(duressEvents.length).toBeGreaterThanOrEqual(1)
      expect(duressEvents.find(e => e.pubkey === missingPubkey)).toBeTruthy()

      monitor.stop()
    })
  })

  it('round-trips a duress alert for a derived persona', async () => {
    vi.useRealTimers()
    const groupSeed = 'b'.repeat(64)
    const memberPubkey = derivedPubkeys[0]

    const encrypted = await propagateDuressAlert(memberPubkey, groupSeed)
    const key = deriveDuressKey(groupSeed)
    const decrypted = await decryptDuressAlert(key, encrypted)

    expect(decrypted.type).toBe('duress')
    expect(decrypted.member).toBe(memberPubkey)
  })

  it('cleans up all persona key material', () => {
    // Capture refs before destroy
    const privateKeys = handles.map(h => h.persona.identity.privateKey)
    for (const h of handles) h.destroy()
    // All private keys should be zeroised
    for (const pk of privateKeys) {
      expect(pk.every(b => b === 0)).toBe(true)
    }
  })
})

describe('full trust lifecycle', () => {
  // Shared state across sequential test steps
  let circle: ReturnType<typeof createTrustCircle>
  let ringEndorsedEvent: EventTemplate
  let standardAssertionEvents: EventTemplate[]

  // ---------- Step 1: NIP-85 user assertions ----------

  it('builds NIP-85 user assertions for each identity', () => {
    // Each member builds a kind 30382 assertion about the external subject
    standardAssertionEvents = pubkeys.map((_pk, i) =>
      buildUserAssertion(externalSubject, { rank: 70 + i * 5 }),
    )

    expect(standardAssertionEvents).toHaveLength(5)
    for (const event of standardAssertionEvents) {
      expect(event.kind).toBe(NIP85_KINDS.USER)
      expect(event.tags.find(t => t[0] === 'd')?.[1]).toBe(externalSubject)
    }
  })

  // ---------- Step 2: create trust circle ----------

  it('creates a trust circle from 5 pubkeys', () => {
    circle = createTrustCircle(pubkeys)
    expect(circle.size).toBe(5)
    expect(circle.members).toHaveLength(5)
    // Members are sorted
    const sorted = [...pubkeys].sort()
    expect(circle.members).toEqual(sorted)
  })

  // ---------- Step 3: contribute a ring endorsement ----------

  it('contributes an anonymous ring endorsement', { timeout: 30_000 }, () => {
    const signerIndex = 0
    const signerPubkey = pubkeys[signerIndex]
    const memberIndex = circle.members.indexOf(signerPubkey)

    const contribution = contributeAssertion(
      circle,
      externalSubject,
      { rank: 95 },
      privKeyHexes[signerIndex],
      memberIndex,
    )

    expect(contribution.keyImage).toBeTruthy()
    expect(contribution.metrics).toEqual({ rank: 95 })

    // ---------- Step 4: aggregate ----------
    ringEndorsedEvent = aggregateContributions(circle, externalSubject, [contribution])
    expect(ringEndorsedEvent.kind).toBe(NIP85_KINDS.USER)
    expect(ringEndorsedEvent.tags.find(t => t[0] === 'veil-ring')).toBeTruthy()
    expect(ringEndorsedEvent.tags.find(t => t[0] === 'veil-threshold')).toBeTruthy()
    expect(ringEndorsedEvent.tags.find(t => t[0] === 'veil-sig')).toBeTruthy()
  })

  // ---------- Step 5: verify the proof ----------

  it('verifies the ring signature proof', () => {
    const proof = verifyProof(ringEndorsedEvent)
    expect(proof.valid).toBe(true)
    expect(proof.circleSize).toBe(5)
    expect(proof.distinctSigners).toBe(1)
    expect(proof.errors).toHaveLength(0)
  })

  // ---------- Step 6: build trust graph ----------

  it('builds a trust graph from standard + ring-endorsed assertions', () => {
    // For the graph to distinguish ring vs non-ring, we need events with
    // provider p-tags. buildUserAssertion sets p to the subject, but the
    // graph builder reads p as the provider. Construct standard events
    // manually so they have distinct providers and the subject d-tag.
    const manualStandard: EventTemplate[] = pubkeys.map((providerPk, i) => ({
      kind: NIP85_KINDS.USER,
      content: '',
      tags: [
        ['d', externalSubject],
        ['p', providerPk],
        ['rank', String(70 + i * 5)],
      ],
    }))

    const allEvents = [...manualStandard, ringEndorsedEvent]
    const graph = buildTrustGraph(allEvents)

    expect(graph.nodes.size).toBe(1) // single subject
    expect(graph.edges.length).toBe(6) // 5 standard + 1 ring

    const node = graph.nodes.get(externalSubject)!
    expect(node.endorsements).toBe(5)
    expect(node.ringEndorsements).toBe(1)
  })

  // ---------- Step 7: ring-endorsed subject ranks higher ----------

  it('ring-endorsed subject ranks higher than non-ring subjects', () => {
    const nonRingSubject = '00'.repeat(32)

    // Subject A: only standard endorsements (2 providers)
    const eventsA: EventTemplate[] = [
      {
        kind: NIP85_KINDS.USER,
        content: '',
        tags: [['d', nonRingSubject], ['p', pubkeys[0]], ['rank', '80']],
      },
      {
        kind: NIP85_KINDS.USER,
        content: '',
        tags: [['d', nonRingSubject], ['p', pubkeys[1]], ['rank', '75']],
      },
    ]

    // Subject B: same 2 standard endorsements PLUS a ring endorsement
    const eventsB: EventTemplate[] = [
      {
        kind: NIP85_KINDS.USER,
        content: '',
        tags: [['d', externalSubject], ['p', pubkeys[2]], ['rank', '70']],
      },
      {
        kind: NIP85_KINDS.USER,
        content: '',
        tags: [['d', externalSubject], ['p', pubkeys[3]], ['rank', '65']],
      },
      ringEndorsedEvent,
    ]

    const graph = buildTrustGraph([...eventsA, ...eventsB])
    const ranks = computeTrustRank(graph)

    expect(ranks.length).toBe(2)

    const ringSubjectRank = ranks.find(r => r.pubkey === externalSubject)!
    const plainSubjectRank = ranks.find(r => r.pubkey === nonRingSubject)!

    // Ring-endorsed subject: 2 standard + 1 ring (2x weight) = 4
    // Plain subject: 2 standard = 2
    // theoreticalMax = 4 standard + 1 ring*2 = 6
    // ringSubject rank = round(4/6 * 100) = 67
    // plainSubject rank = round(2/6 * 100) = 33
    expect(ringSubjectRank.rank).toBeGreaterThan(plainSubjectRank.rank)
    expect(ringSubjectRank.ringEndorsements).toBe(1)
    expect(plainSubjectRank.ringEndorsements).toBe(0)
  })

  // ---------- Step 8: duress monitor ----------

  describe('duress monitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('fires duress event when a member misses heartbeats', () => {
      const monitor = createDuressMonitor({ toleranceMs: 100, checkIntervalMs: 50 })
      const duressEvents: Array<{ pubkey: string }> = []
      monitor.on('duress', (e) => duressEvents.push(e))
      monitor.start()

      const activePubkeys = pubkeys.slice(0, 4)
      const missingPubkey = pubkeys[4]

      // All 5 members send initial heartbeats at t=0
      for (const pk of [...activePubkeys, missingPubkey]) {
        monitor.heartbeat(pk)
      }

      // Advance to t=80 (within tolerance), refresh the 4 active members
      vi.advanceTimersByTime(80)
      for (const pk of activePubkeys) {
        monitor.heartbeat(pk)
      }
      // missingPubkey does NOT refresh

      // Advance to t=110 — missing member's tolerance (100ms since t=0) expires
      vi.advanceTimersByTime(30)

      expect(duressEvents.length).toBeGreaterThanOrEqual(1)
      const missingEvent = duressEvents.find(e => e.pubkey === missingPubkey)
      expect(missingEvent).toBeTruthy()

      // Active members refreshed at t=80, now at t=110 (30ms elapsed) — still active
      const state = monitor.getState()
      for (const pk of activePubkeys) {
        expect(state.get(pk)?.status).toBe('active')
      }

      monitor.stop()
    })
  })

  // ---------- Step 9: propagate duress alert ----------

  it('round-trips a duress alert via encrypt/decrypt', async () => {
    const groupSeed = 'a'.repeat(64)
    const memberPubkey = pubkeys[0]

    const encrypted = await propagateDuressAlert(memberPubkey, groupSeed)
    expect(typeof encrypted).toBe('string')
    expect(encrypted.length).toBeGreaterThan(0)

    const key = deriveDuressKey(groupSeed)
    const decrypted = await decryptDuressAlert(key, encrypted)

    expect(decrypted.type).toBe('duress')
    expect(decrypted.member).toBe(memberPubkey)
    expect(typeof decrypted.timestamp).toBe('number')
  })
})
