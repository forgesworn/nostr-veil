/**
 * Compatibility shim for @noble/curves/secp256k1 — noble v2 requires Uint8Array
 * but Nostr tooling conventionally passes hex strings to schnorr functions.
 * This shim re-exports schnorr with hex-string support for the signing layer.
 */
import { schnorr as _schnorr } from '@noble/curves/secp256k1.js'
import { hexToBytes } from '@noble/hashes/utils.js'

type HexOrBytes = string | Uint8Array

function coerce(v: HexOrBytes): Uint8Array {
  return typeof v === 'string' ? hexToBytes(v) : v
}

export const schnorr = {
  getPublicKey: (privKey: HexOrBytes) => _schnorr.getPublicKey(coerce(privKey)),
  sign: (msg: HexOrBytes, privKey: HexOrBytes) => _schnorr.sign(coerce(msg), coerce(privKey)),
  verify: (sig: HexOrBytes, msg: HexOrBytes, pubKey: HexOrBytes) =>
    _schnorr.verify(coerce(sig), coerce(msg), coerce(pubKey)),
  utils: _schnorr.utils,
}

export { secp256k1 } from '@noble/curves/secp256k1.js'
