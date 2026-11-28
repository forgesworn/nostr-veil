// Anonymous flags inside a private room.
//
// Members of a private room flag a message. Nobody, moderators included, learns
// who flagged it. A member cannot flag twice. The flag surfaces only once
// THRESHOLD distinct members have raised it. Nothing reaches a relay in the
// clear, so the room's roster is never published.
//
// The room is the trust circle. Each flag is a one-signer veil event about the
// flagged message, sealed to the room key and posted under a throwaway Nostr
// key. Every member's client opens the envelopes and counts the distinct
// flaggers itself, so there is no aggregator to trust and none to leave a flag
// out.
//
// What the host app must provide, and this script only stands in for:
//   - a per-room key pair for every member, with the public halves known to
//     all members (the app holds the private half, so no signer is involved)
//   - the room's own encryption (here: AES-GCM under one shared room key)
//   - a way to post without naming the member: a throwaway outer key, no relay
//     authentication as the member, and a network path that hides their address
//
// Limits that no code here removes: in a very small room the other members can
// work out who flagged; a member who is made to hand over their room key can be
// shown to have flagged or not; and anyone holding the room key can post junk,
// which costs each reader a ring verification to reject.

import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  NIP85_KINDS,
  aggregateEventContributions,
  computeCircleId,
  contributeEventAssertion,
  createTrustCircle,
  electionIdV2,
  signEvent,
  verifyProof,
  verifySignedEvent,
} from 'nostr-veil'
import type { EventTemplate, SignedEvent, TrustCircle } from 'nostr-veil'

interface RoomKey {
  priv: string
  pub: string
}

/** Stand-in for the host app's own envelope kind. */
const ENVELOPE_KIND = 21000
const THRESHOLD = 3
/** A flag is a 1 and nothing else, and a flag without the metric is not a flag. */
const FLAG_BOUNDS = { rank: { min: 1, max: 1, integer: true, required: true } }
const VERIFY_OPTIONS = {
  contributionBounds: FLAG_BOUNDS,
  expectedKind: NIP85_KINDS.EVENT,
  requireAggregate: 'median',
  requireProofVersion: 'v2',
} as const

function newKey(): RoomKey {
  const secret = schnorr.utils.randomSecretKey()
  return { priv: bytesToHex(secret), pub: bytesToHex(schnorr.getPublicKey(secret)) }
}

// --- The room -------------------------------------------------------------

const roster = Array.from({ length: 8 }, newKey)
// One scope per room keeps a member's key image the same if the roster changes,
// so a member who flagged before a new member joined cannot flag again after.
const ROOM_SCOPE = 'room.kitchen-table'
const room = createTrustCircle(roster.map(member => member.pub), { scope: ROOM_SCOPE })
const roomKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const flaggedMessageId = 'ab'.repeat(32)
// Every flag for this message in this room is signed under this election id,
// so one member's flags for it all carry the same key image
const FLAG_ELECTION_ID = electionIdV2(ROOM_SCOPE, flaggedMessageId, {
  kind: NIP85_KINDS.EVENT,
  subjectTag: 'e',
  subjectTagValue: flaggedMessageId,
})

// --- Sealing: the host app's job ------------------------------------------

async function sealToRoom(flag: unknown): Promise<SignedEvent> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(flag))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, roomKey, plaintext))
  // A fresh key for every envelope: the outer event names nobody in the room
  return signEvent(
    { kind: ENVELOPE_KIND, tags: [], content: `${bytesToHex(iv)}:${bytesToHex(ciphertext)}` },
    newKey().priv,
  )
}

/** What the envelope holds, which is whatever its sender sealed, or null. */
async function openFromRoom(envelope: SignedEvent): Promise<unknown> {
  try {
    const [iv, ciphertext] = envelope.content.split(':')
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(iv) },
      roomKey,
      hexToBytes(ciphertext),
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
  } catch {
    return null
  }
}

// --- Flagging: one member, one flag ---------------------------------------

function flagFrom(member: RoomKey, circle: TrustCircle, metrics: Record<string, number> = { rank: 1 }): EventTemplate {
  const contribution = contributeEventAssertion(
    circle,
    flaggedMessageId,
    metrics,
    member.priv,
    circle.members.indexOf(member.pub),
  )
  // A one-signer event. The flagger builds it, so nobody collects contributions.
  // A member's own client applies the bounds. Another member's client cannot be made to.
  const bounds = Object.keys(metrics).length === 0 ? undefined : FLAG_BOUNDS
  return aggregateEventContributions(circle, flaggedMessageId, [contribution], { contributionBounds: bounds })
}

// --- Reading: every member's client does this for itself -------------------

function ringCircleId(event: EventTemplate): string | undefined {
  const ring = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  return ring === undefined ? undefined : computeCircleId(ring)
}

/** A flag's one veil-sig tag, or undefined where it has none or more than one. */
function onlySignature(flag: EventTemplate): string[] | undefined {
  const signatures = flag.tags.filter(tag => tag[0] === 'veil-sig')
  return signatures.length === 1 ? signatures[0] : undefined
}

/** The election id a signature says it was made under, or undefined. */
function signedElectionId(signature: string[]): string | undefined {
  try {
    const payload: unknown = JSON.parse(signature[1])
    const electionId = payload !== null && typeof payload === 'object'
      ? (payload as { electionId?: unknown }).electionId
      : undefined
    return typeof electionId === 'string' ? electionId : undefined
  } catch {
    return undefined
  }
}

/** Whether what opened has the shape of an event: tags that are lists of strings. */
function isEventShaped(value: unknown): value is EventTemplate {
  if (value === null || typeof value !== 'object') return false
  const tags: unknown = (value as { tags?: unknown }).tags
  return Array.isArray(tags)
    && tags.every(tag => Array.isArray(tag) && tag.every(element => typeof element === 'string'))
}

/**
 * The flagger's key image, if what opened is a sound flag for this message in
 * this room. The cheap checks come before the ring verification: this room's
 * ring, this message, one signer, and this room's election id for the
 * message. A circle's id leaves out its scope, so a flag signed under no
 * scope, or another, has the room's ring and a key image of its own.
 */
function flaggerOf(flag: unknown): string | undefined {
  if (!isEventShaped(flag)) return undefined
  const signature = onlySignature(flag)
  if (
    signature === undefined
    || ringCircleId(flag) !== room.circleId
    || flag.tags.find(tag => tag[0] === 'd')?.[1] !== flaggedMessageId
    || signedElectionId(signature) !== FLAG_ELECTION_ID
  ) {
    return undefined
  }
  // The key image the proof verifies. It is the same in every flag one member
  // makes for this message, so counting key images counts members.
  return verifyProof(flag, VERIFY_OPTIONS).valid ? signature[2] : undefined
}

async function countFlags(envelopes: SignedEvent[]): Promise<{ distinct: number; rejected: number; valid: number }> {
  const flaggers = new Set<string>()
  let valid = 0
  let rejected = 0

  for (const envelope of envelopes) {
    // Each envelope is read once and judged on its own: one that fails, or
    // cannot be read at all, is passed over and cannot take the others with it
    let flagger: string | undefined
    try {
      flagger = verifySignedEvent(envelope) ? flaggerOf(await openFromRoom(envelope)) : undefined
    } catch {
      flagger = undefined
    }
    if (flagger === undefined) {
      rejected += 1
      continue
    }
    valid += 1
    flaggers.add(flagger)
  }

  return { distinct: flaggers.size, rejected, valid }
}

// --- A run ----------------------------------------------------------------

const posted: SignedEvent[] = []

posted.push(await sealToRoom(flagFrom(roster[0], room)))
posted.push(await sealToRoom(flagFrom(roster[1], room)))
const early = await countFlags(posted)

// The same member flags again. It is a new envelope and a new signature, and
// still the same key image.
posted.push(await sealToRoom(flagFrom(roster[1], room)))

// Someone who holds the room key but is not on the roster builds a ring that
// includes their own key. The proof is sound; it is not this room's ring.
const outsider = newKey()
const padded = createTrustCircle([...roster.slice(0, 7).map(member => member.pub), outsider.pub], {
  scope: 'room.kitchen-table',
})
posted.push(await sealToRoom(flagFrom(outsider, padded)))

// A member whose client skips the bounds signs a flag with no metric in it.
// Without `required` on the bound it would still count as a signer.
posted.push(await sealToRoom(flagFrom(roster[6], room, {})))

// Two members sign sound flags for the same message under the same roster,
// one with no scope and one with another. The ring is the room's, so each
// passes the circle check, but each key image is a new one, which would let a
// member flag again. Each is turned away on its own.
posted.push(await sealToRoom(flagFrom(roster[2], createTrustCircle(roster.map(member => member.pub)))))
posted.push(await sealToRoom(flagFrom(roster[3], createTrustCircle(roster.map(member => member.pub), { scope: 'room.other' }))))

// Anyone holding the room key can seal anything at all, so a reader must not
// be stopped by what opens. Each of these is turned away on its own.
const junk: unknown[] = [
  {},
  42,
  { tags: [null] },
  { tags: [{ 0: 'veil-ring' }, ['veil-sig', '{}', 'x']] },
  { kind: NIP85_KINDS.EVENT, content: '', tags: [['veil-ring', 'not a key', 'nor this'], ['d', flaggedMessageId]] },
]
for (const plaintext of junk) posted.push(await sealToRoom(plaintext))

posted.push(await sealToRoom(flagFrom(roster[5], room)))
const late = await countFlags(posted)

const wire = JSON.stringify(posted)
const rosterOnWire = roster.some(member => wire.includes(member.pub))
const outerKeys = new Set(posted.map(envelope => envelope.pubkey))

console.log(`in-room-flags: after-two distinct=${early.distinct} surfaced=${early.distinct >= THRESHOLD ? 'yes' : 'no'}`)
console.log(
  `in-room-flags: envelopes=${posted.length} valid=${late.valid} rejected=${late.rejected} distinct=${late.distinct} `
  + `threshold=${THRESHOLD} surfaced=${late.distinct >= THRESHOLD ? 'yes' : 'no'}`,
)
console.log(
  `in-room-flags: roster-on-wire=${rosterOnWire ? 'yes' : 'no'} outer-keys=${outerKeys.size} `
  + `outer-keys-in-roster=${[...outerKeys].filter(key => room.members.includes(key)).length}`,
)
