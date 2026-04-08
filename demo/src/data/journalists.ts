import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const SEEDS = [
  '1001010101010101010101010101010101010101010101010101010101010101',
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

/** Real derived pubkey from nsec-tree persona "veil-demo-journalist" */
const DERIVED_PUBKEY = 'f8237d3cba84106bee74c583f0772a1b852d3360f0186eae5ee0285cca4f8f6b'

export interface Journalist {
  name: string
  privateKey: string
  publicKey: string
  /** True if this member connected via NIP-07 (Bark) */
  nip07?: boolean
  /** Real pubkey from NIP-07 signer (used for display + publishing, not LSAG ring) */
  nip07Pubkey?: string
  /** Pubkey to show in the UI (derived persona or NIP-07 pubkey) */
  displayPubkey?: string
}

export const journalists: Journalist[] = SEEDS.map((seed, i) => ({
  name: NAMES[i],
  privateKey: seed,
  publicKey: bytesToHex(schnorr.getPublicKey(hexToBytes(seed))),
}))

/**
 * Mark the first journalist as connected via NIP-07.
 * The ring pubkey stays as the demo key (LSAG needs a matching keypair).
 * The real pubkey is stored separately for display and final event signing.
 * If the connected pubkey matches the derived persona, show it in the UI.
 */
export function connectNip07Identity(pubkey: string): void {
  journalists[0] = {
    ...journalists[0],
    nip07: true,
    nip07Pubkey: pubkey,
    // Show the derived persona pubkey in the member list if connected
    displayPubkey: pubkey === DERIVED_PUBKEY ? DERIVED_PUBKEY : pubkey,
  }
}
