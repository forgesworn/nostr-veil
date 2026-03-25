import { sha256 } from '@noble/hashes/sha2.js'
import { schnorr } from './_noble-compat.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export interface UnsignedEvent {
  kind: number
  tags: string[][]
  content: string
  created_at?: number
  pubkey?: string
}

export interface SignedEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/**
 * Compute the NIP-01 event ID (SHA-256 of the canonical serialisation).
 *
 * The canonical serialisation is the JSON array `[0, pubkey, created_at, kind, tags, content]`
 * with no extra whitespace, as defined in NIP-01.
 *
 * @param event - Object containing `pubkey`, `created_at`, `kind`, `tags`, and `content`
 * @returns A 64-char hex SHA-256 digest that serves as the event's `id` field
 *
 * @example
 * const id = computeEventId({ pubkey, created_at: Math.floor(Date.now() / 1000), kind: 1, tags: [], content: 'hello' })
 * // '2cf24dba…' (64-char hex)
 */
export function computeEventId(
  event: { pubkey: string; created_at: number; kind: number; tags: string[][]; content: string }
): string {
  const serialised = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])
  return bytesToHex(sha256(new TextEncoder().encode(serialised)))
}

/**
 * Sign an unsigned event template with a Schnorr private key, producing a fully-signed Nostr event.
 *
 * If `template.created_at` is omitted, the current Unix timestamp is used. The
 * `pubkey` is derived from the private key via BIP-340 Schnorr, so the caller
 * need not supply it separately.
 *
 * @param template - An {@link UnsignedEvent} with `kind`, `tags`, and `content` (plus optional `created_at`)
 * @param privateKey - 32-byte hex-encoded Schnorr private key (64 chars)
 * @returns A fully-signed {@link SignedEvent} with `id`, `pubkey`, `created_at`, `sig`, and all template fields
 *
 * @example
 * const tmpl = buildUserAssertion(subjectPubkey, { rank: 85 })
 * const event = signEvent(tmpl, providerPrivkey)
 * // event.id, event.pubkey, event.sig are now populated
 */
export function signEvent(template: UnsignedEvent, privateKey: string): SignedEvent {
  const pubkey = bytesToHex(schnorr.getPublicKey(privateKey))
  const created_at = template.created_at ?? Math.floor(Date.now() / 1000)

  const event = {
    pubkey,
    created_at,
    kind: template.kind,
    tags: template.tags,
    content: template.content,
  }

  const id = computeEventId(event)
  const sig = bytesToHex(schnorr.sign(id, privateKey))

  return { ...event, id, sig }
}
