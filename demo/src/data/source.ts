import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const SOURCE_SEED = '9009090909090909090909090909090909090909090909090909090909090909'

export const source = {
  name: 'Anonymous Source',
  description: 'Claims to have leaked documents from a major corporation.',
  privateKey: SOURCE_SEED,
  publicKey: bytesToHex(schnorr.getPublicKey(hexToBytes(SOURCE_SEED))),
}
