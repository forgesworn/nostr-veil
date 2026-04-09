import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { nip19 } from 'nostr-tools'

/** Decode nsec from env var to hex privkey; fall back to placeholder if unset. */
function journalistPrivkey(): string {
  const raw = import.meta.env.VITE_JOURNALIST_PRIVKEY as string | undefined
  if (raw?.startsWith('nsec1')) {
    const decoded = nip19.decode(raw)
    if (decoded.type === 'nsec') return bytesToHex(decoded.data as Uint8Array)
  }
  return '1001010101010101010101010101010101010101010101010101010101010101'
}

const SEEDS = [
  journalistPrivkey(), // TODO(lsag-esp32): replace with heartwood_lsag_sign when ESP32 firmware lands
  '2002020202020202020202020202020202020202020202020202020202020202',
  '3003030303030303030303030303030303030303030303030303030303030303',
  '4004040404040404040404040404040404040404040404040404040404040404',
  '5005050505050505050505050505050505050505050505050505050505050505',
  '6006060606060606060606060606060606060606060606060606060606060606',
  '7007070707070707070707070707070707070707070707070707070707070707',
  '8008080808080808080808080808080808080808080808080808080808080808',
]

const NAMES = [
  'veil-demo-journalist', 'Marcus Chen', 'Amira Hassan', "Liam O'Brien",
  'Yuki Tanaka', 'Fatima Reyes', 'Nikolai Petrov', 'Sarah Okafor',
]

export interface Journalist {
  name: string
  privateKey: string
  publicKey: string
  /** True if this member connected via NIP-07 (Bark) */
  nip07?: boolean
  /** True if this member uses a browser-generated demo identity */
  demo?: boolean
  /** Real pubkey from NIP-07 signer (used for display + publishing, not LSAG ring) */
  nip07Pubkey?: string
  /** Pubkey to show in the UI */
  displayPubkey?: string
}

export const journalists: Journalist[] = SEEDS.map((seed, i) => ({
  name: NAMES[i],
  privateKey: seed,
  publicKey: bytesToHex(schnorr.getPublicKey(hexToBytes(seed))),
}))

export function connectNip07Identity(pubkey: string): void {
  journalists[0] = {
    ...journalists[0],
    nip07: true,
    nip07Pubkey: pubkey,
    displayPubkey: pubkey,
  }
}

export function injectDemoIdentity(privateKey: string, publicKey: string): void {
  journalists[0] = {
    ...journalists[0],
    privateKey,
    publicKey,
    demo: true,
  }
}
