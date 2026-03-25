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

/** Compute the NIP-01 event ID (SHA-256 of the canonical serialisation). */
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

/** Sign an unsigned event template with a Schnorr private key, producing a fully-signed Nostr event. */
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
