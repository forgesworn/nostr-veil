import { createBlindProof, createFullProof } from 'nsec-tree/proof'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { TreeRoot, Identity, LinkageProof } from 'nsec-tree'
import type { DisclosureProofs } from './types.js'
import type { EventTemplate } from '../nip85/types.js'

/** Prove two identities share a common master key. Mode: 'blind' (default) or 'full' disclosure. */
export function proveCommonOwnership(
  root: TreeRoot,
  identityA: Identity,
  identityB: Identity,
  mode: 'blind' | 'full' = 'blind'
): DisclosureProofs {
  const proveFn = mode === 'blind' ? createBlindProof : createFullProof
  return [proveFn(root, identityA), proveFn(root, identityB)]
}

/** Build a kind 30078 event containing linkage proofs for two related identities. */
export function buildDisclosureEvent(proofs: DisclosureProofs): EventTemplate {
  const [proofA, proofB] = proofs
  const dTagHash = bytesToHex(sha256(new TextEncoder().encode(proofA.masterPubkey)))

  return {
    kind: 30078,
    tags: [
      ['d', `veil:disclosure:${dTagHash}`],
      ['veil-linkage-a', proofA.childPubkey, proofA.attestation, proofA.signature,
        ...(proofA.purpose !== undefined ? [proofA.purpose, String(proofA.index)] : [])],
      ['veil-linkage-b', proofB.childPubkey, proofB.attestation, proofB.signature,
        ...(proofB.purpose !== undefined ? [proofB.purpose, String(proofB.index)] : [])],
      ['veil-master', proofA.masterPubkey],
    ],
    content: '',
  }
}
