import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  computeCircleId,
  validateAssertionStrict,
  verifyFederation,
  verifyProof,
} from 'nostr-veil'
import type {
  EventTemplate,
  FederationVerification,
  ProofVerification,
  TrustCircle,
  ValidationResult,
} from 'nostr-veil'

export type AssertionTemplate = EventTemplate

export interface ExampleKey {
  priv: string
  pub: string
}

export interface AssertionUseCaseResult {
  slug: string
  syntax: ValidationResult
  proof: ProofVerification
  assertion: AssertionTemplate
}

export interface FederationUseCaseResult {
  slug: string
  proof: FederationVerification
  events: AssertionTemplate[]
}

export type UseCaseResult = AssertionUseCaseResult | FederationUseCaseResult

export const proofVersion = 'v2' as const
export const externalProfileKind = '0'
export const exampleNow = 1_778_000_000

export const keys: ExampleKey[] = ['11', '22', '33', '44'].map(byte => {
  const priv = byte.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})

export const defaultMembers = keys.slice(0, 3)
export const subjectPubkey = keys[3].pub
export const authorPubkey = keys[0].pub

export function memberIndex(circle: TrustCircle, pubkey: string): number {
  const index = circle.members.indexOf(pubkey)
  if (index === -1) throw new Error('pubkey is not a member of this circle')
  return index
}

export function withCreatedAt<T extends AssertionTemplate>(assertion: T): T & { created_at: number } {
  assertion.created_at = exampleNow
  return assertion as T & { created_at: number }
}

function tagValue(assertion: AssertionTemplate, name: string): string | undefined {
  return assertion.tags.find(tag => tag[0] === name)?.[1]
}

function ringCircleId(assertion: AssertionTemplate): string | undefined {
  const ring = assertion.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  return ring === undefined ? undefined : computeCircleId(ring)
}

export function verifyUseCaseAssertion(
  slug: string,
  assertion: AssertionTemplate,
  expected: {
    kind: number
    subject: string
    subjectTag: 'p' | 'e' | 'a' | 'k'
    subjectTagValue?: string
    circleId: string
    minDistinctSigners: number
    freshAfter?: number
  },
): AssertionUseCaseResult {
  const syntax = validateAssertionStrict(assertion)
  const proof = verifyProof(assertion, { requireProofVersion: proofVersion })
  const errors = [...syntax.errors, ...proof.errors]

  if (assertion.kind !== expected.kind) {
    errors.push(`expected kind ${expected.kind}, got ${assertion.kind}`)
  }
  if (tagValue(assertion, 'd') !== expected.subject) {
    errors.push('d tag does not match expected subject')
  }
  if (tagValue(assertion, expected.subjectTag) !== (expected.subjectTagValue ?? expected.subject)) {
    errors.push(`${expected.subjectTag} tag does not match expected subject hint`)
  }
  if (ringCircleId(assertion) !== expected.circleId) {
    errors.push('veil-ring does not match expected circle')
  }
  if (proof.distinctSigners < expected.minDistinctSigners) {
    errors.push(`expected at least ${expected.minDistinctSigners} distinct signers`)
  }
  if (expected.freshAfter !== undefined && (assertion.created_at ?? 0) < expected.freshAfter) {
    errors.push('assertion is outside the accepted freshness window')
  }

  if (!syntax.valid || !proof.valid || errors.length > 0) {
    throw new Error(`${slug} verification failed: ${errors.join('; ')}`)
  }

  return { slug, syntax, proof, assertion }
}

export function verifyFederatedUseCase(
  slug: string,
  events: AssertionTemplate[],
  expected: {
    kind: number
    subject: string
    scope: string
    minDistinctSigners: number
  },
): FederationUseCaseResult {
  const proof = verifyFederation(events)
  const errors = [...proof.errors]

  if (!events.every(event => event.kind === expected.kind)) {
    errors.push(`all events must be kind ${expected.kind}`)
  }
  if (proof.subject !== expected.subject) {
    errors.push('federation subject does not match expected subject')
  }
  if (proof.scope !== expected.scope) {
    errors.push('federation scope does not match expected scope')
  }
  if (proof.distinctSigners < expected.minDistinctSigners) {
    errors.push(`expected at least ${expected.minDistinctSigners} distinct federation signers`)
  }

  if (!proof.valid || errors.length > 0) {
    throw new Error(`${slug} verification failed: ${errors.join('; ')}`)
  }

  return { slug, proof, events }
}

export function printResult(result: UseCaseResult): void {
  console.log(`${result.slug}: proof=${result.proof.valid ? 'yes' : 'no'}`)
}
