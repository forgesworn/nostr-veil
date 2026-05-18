import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { verifyProductionDeployment } from './production.js'
import type { EventTemplate } from '../nip85/types.js'
import type { SignedDeploymentBundle } from './bundle.js'
import type { ProductionDeploymentVerification, VerifyProductionDeploymentOptions } from './production.js'

export const ADMISSION_CHALLENGE_TYPE = 'nostr-veil-admission-challenge'
export const ADMISSION_PRESENTATION_TYPE = 'nostr-veil-admission-presentation'

export type AdmissionDecision = 'admit' | 'manual-review' | 'rate-limit' | 'deny' | 'revoke'

export interface AdmissionChallengePayload {
  version: 1
  type: typeof ADMISSION_CHALLENGE_TYPE
  applicantPubkey: string
  audience: string
  expiresAt: number
  issuedAt: number
  nonce: string
}

export interface AdmissionChallenge extends AdmissionChallengePayload {
  id: string
}

export interface CreateAdmissionChallengeOptions {
  applicantPubkey: string
  audience: string
  expiresAt?: number
  issuedAt?: number
  maxAgeSeconds?: number
  nonce?: string
}

export interface AdmissionPresentationPayload {
  version: 1
  type: typeof ADMISSION_PRESENTATION_TYPE
  applicantPubkey: string
  audience: string
  challengeId: string
  createdAt: number
}

export interface AdmissionPresentation extends AdmissionPresentationPayload {
  signature: string
}

export interface CreateAdmissionPresentationOptions {
  createdAt?: number
}

export interface VerifyAdmissionPresentationOptions {
  expectedApplicantPubkey?: string
  expectedAudience?: string
  now?: number
  usedChallengeIds?: Iterable<string>
}

export interface AdmissionPresentationVerification {
  applicantPubkey: string
  audience: string
  challengeId: string
  errors: string[]
  replayed: boolean
  signatureValid: boolean
  valid: boolean
}

export interface VerifyAdmissionRequestOptions extends VerifyProductionDeploymentOptions {
  admitRank?: number
  expectedAudience?: string
  manualReviewRank?: number
  rateLimitRank?: number
  revokedApplicantPubkeys?: Iterable<string>
  usedChallengeIds?: Iterable<string>
}

export interface AdmissionRequestVerification {
  applicantPubkey: string
  decision: AdmissionDecision
  deployment: ProductionDeploymentVerification
  errors: string[]
  presentation: AdmissionPresentationVerification
  rank: number | null
  valid: boolean
}

const HEX64_RE = /^[0-9a-f]{64}$/
const HEX128_RE = /^[0-9a-f]{128}$/
const DEFAULT_CHALLENGE_MAX_AGE_SECONDS = 120

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function assertHex64(value: string, label: string): void {
  if (!HEX64_RE.test(value)) throw new Error(`${label} must be a 64-character lowercase hex string`)
}

function assertSafeUnix(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative Unix timestamp`)
  }
}

function isSafeUnix(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function normaliseAudience(audience: string): string {
  const value = audience.trim()
  if (value === '') throw new Error('audience must be non-empty')
  if (/\s/.test(value)) throw new Error('audience must not contain whitespace')
  return value
}

function normaliseNonce(nonce: string): string {
  const value = nonce.trim().toLowerCase()
  if (!/^[0-9a-f]{32,}$/.test(value) || value.length % 2 !== 0) {
    throw new Error('nonce must be at least 16 bytes of lowercase hex')
  }
  return value
}

function randomNonceHex(byteLength = 32): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16) {
    throw new Error('nonce byte length must be at least 16')
  }
  const crypto = globalThis.crypto
  if (crypto === undefined || typeof crypto.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is required when nonce is not supplied')
  }
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) => {
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(child as Record<string, unknown>).sort()) {
        sorted[key] = (child as Record<string, unknown>)[key]
      }
      return sorted
    }
    return child
  })
}

function digest(type: string, payload: unknown): Uint8Array {
  return sha256(new TextEncoder().encode(`${type}:v1\n${stableStringify(payload)}`))
}

function challengePayload(challenge: AdmissionChallenge): AdmissionChallengePayload {
  return {
    version: challenge.version,
    type: challenge.type,
    applicantPubkey: challenge.applicantPubkey,
    audience: challenge.audience,
    expiresAt: challenge.expiresAt,
    issuedAt: challenge.issuedAt,
    nonce: challenge.nonce,
  }
}

function presentationPayload(presentation: AdmissionPresentation): AdmissionPresentationPayload {
  return {
    version: presentation.version,
    type: presentation.type,
    applicantPubkey: presentation.applicantPubkey,
    audience: presentation.audience,
    challengeId: presentation.challengeId,
    createdAt: presentation.createdAt,
  }
}

function admissionChallengeId(payload: AdmissionChallengePayload): string {
  return bytesToHex(digest(ADMISSION_CHALLENGE_TYPE, payload))
}

function presentationDigest(payload: AdmissionPresentationPayload): Uint8Array {
  return digest(ADMISSION_PRESENTATION_TYPE, payload)
}

function usedChallengeSet(ids: Iterable<string> | undefined): Set<string> {
  return ids === undefined ? new Set() : new Set(ids)
}

function revokedApplicantSet(pubkeys: Iterable<string> | undefined): Set<string> {
  return pubkeys === undefined ? new Set() : new Set(pubkeys)
}

function firstRank(result: ProductionDeploymentVerification): number | null {
  const value = result.deployment.metrics.rank?.[0]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function decisionForRank(rank: number | null, options: VerifyAdmissionRequestOptions): AdmissionDecision {
  const admitRank = options.admitRank ?? 90
  const rateLimitRank = options.rateLimitRank ?? 75
  const manualReviewRank = options.manualReviewRank ?? 0

  if (rank === null) return 'manual-review'
  if (rank >= admitRank) return 'admit'
  if (rank >= rateLimitRank) return 'rate-limit'
  if (rank >= manualReviewRank) return 'manual-review'
  return 'deny'
}

/**
 * Create a relay/community admission challenge.
 *
 * This is deliberately outside the NIP-85 event. The vouch remains a normal
 * kind 30382 assertion with additive `veil-*` proof tags; the challenge only
 * binds a live admission attempt to an applicant and audience.
 */
export function createAdmissionChallenge(options: CreateAdmissionChallengeOptions): AdmissionChallenge {
  const issuedAt = options.issuedAt ?? nowSeconds()
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_CHALLENGE_MAX_AGE_SECONDS
  const expiresAt = options.expiresAt ?? issuedAt + maxAgeSeconds
  assertSafeUnix(issuedAt, 'issuedAt')
  assertSafeUnix(expiresAt, 'expiresAt')
  if (options.expiresAt === undefined) assertPositiveInteger(maxAgeSeconds, 'maxAgeSeconds')
  if (expiresAt <= issuedAt) throw new Error('expiresAt must be greater than issuedAt')

  const payload: AdmissionChallengePayload = {
    version: 1,
    type: ADMISSION_CHALLENGE_TYPE,
    applicantPubkey: options.applicantPubkey.toLowerCase(),
    audience: normaliseAudience(options.audience),
    expiresAt,
    issuedAt,
    nonce: options.nonce === undefined ? randomNonceHex() : normaliseNonce(options.nonce),
  }
  assertHex64(payload.applicantPubkey, 'applicantPubkey')

  return Object.freeze({
    ...payload,
    id: admissionChallengeId(payload),
  })
}

/**
 * Sign an admission challenge as the applicant.
 *
 * The resulting presentation proves control of the applicant pubkey for this
 * challenge. It does not modify the NIP-85 vouch assertion.
 */
export function createAdmissionPresentation(
  challenge: AdmissionChallenge,
  privateKey: string,
  options: CreateAdmissionPresentationOptions = {},
): AdmissionPresentation {
  assertHex64(privateKey, 'privateKey')
  const applicantPubkey = bytesToHex(schnorr.getPublicKey(hexToBytes(privateKey)))
  if (applicantPubkey !== challenge.applicantPubkey) {
    throw new Error('privateKey does not match challenge applicantPubkey')
  }

  const payload: AdmissionPresentationPayload = {
    version: 1,
    type: ADMISSION_PRESENTATION_TYPE,
    applicantPubkey,
    audience: challenge.audience,
    challengeId: challenge.id,
    createdAt: options.createdAt ?? nowSeconds(),
  }
  assertSafeUnix(payload.createdAt, 'createdAt')

  return Object.freeze({
    ...payload,
    signature: bytesToHex(schnorr.sign(presentationDigest(payload), hexToBytes(privateKey))),
  })
}

export function verifyAdmissionPresentation(
  presentation: AdmissionPresentation,
  challenge: AdmissionChallenge,
  options: VerifyAdmissionPresentationOptions = {},
): AdmissionPresentationVerification {
  const errors: string[] = []
  const expectedChallengeId = admissionChallengeId(challengePayload(challenge))
  const challengeIssuedAtValid = isSafeUnix(challenge.issuedAt)
  const challengeExpiresAtValid = isSafeUnix(challenge.expiresAt)
  const presentationCreatedAtValid = isSafeUnix(presentation.createdAt)

  if (challenge.version !== 1) errors.push('challenge version must be 1')
  if (challenge.type !== ADMISSION_CHALLENGE_TYPE) {
    errors.push(`challenge type must be ${ADMISSION_CHALLENGE_TYPE}`)
  }
  if (!HEX64_RE.test(challenge.applicantPubkey)) {
    errors.push('challenge applicantPubkey must be a 64-character lowercase hex string')
  }
  if (typeof challenge.audience !== 'string' || challenge.audience.trim() === '' || /\s/.test(challenge.audience)) {
    errors.push('challenge audience must be non-empty and must not contain whitespace')
  }
  if (typeof challenge.nonce !== 'string' || !/^[0-9a-f]{32,}$/.test(challenge.nonce) || challenge.nonce.length % 2 !== 0) {
    errors.push('challenge nonce must be at least 16 bytes of lowercase hex')
  }
  if (!challengeIssuedAtValid) errors.push('challenge issuedAt must be a non-negative Unix timestamp')
  if (!challengeExpiresAtValid) errors.push('challenge expiresAt must be a non-negative Unix timestamp')
  if (challengeIssuedAtValid && challengeExpiresAtValid && challenge.expiresAt <= challenge.issuedAt) {
    errors.push('challenge expiresAt must be greater than issuedAt')
  }
  if (!HEX64_RE.test(challenge.id)) errors.push('challenge id must be a 64-character lowercase hex string')
  if (challenge.id !== expectedChallengeId) errors.push('challenge id does not match challenge payload')
  if (presentation.version !== 1) errors.push('presentation version must be 1')
  if (presentation.type !== ADMISSION_PRESENTATION_TYPE) {
    errors.push(`presentation type must be ${ADMISSION_PRESENTATION_TYPE}`)
  }
  if (!HEX64_RE.test(presentation.challengeId)) {
    errors.push('presentation challengeId must be a 64-character lowercase hex string')
  }
  if (presentation.challengeId !== challenge.id) errors.push('presentation challengeId does not match challenge')
  if (presentation.audience !== challenge.audience) errors.push('presentation audience does not match challenge')
  if (presentation.applicantPubkey !== challenge.applicantPubkey) {
    errors.push('presentation applicant does not match challenge')
  }
  if (options.expectedAudience !== undefined && challenge.audience !== options.expectedAudience) {
    errors.push('admission audience does not match expected audience')
  }
  if (options.expectedApplicantPubkey !== undefined && presentation.applicantPubkey !== options.expectedApplicantPubkey) {
    errors.push('admission applicant does not match expected applicant')
  }
  if (!presentationCreatedAtValid) errors.push('presentation createdAt must be a non-negative Unix timestamp')
  if (options.now !== undefined && challengeIssuedAtValid && challengeExpiresAtValid) {
    if (challenge.issuedAt > options.now) errors.push('admission challenge issuedAt is in the future')
    if (options.now > challenge.expiresAt) errors.push('admission challenge is expired')
  }
  if (presentationCreatedAtValid && challengeIssuedAtValid && presentation.createdAt < challenge.issuedAt) {
    errors.push('presentation createdAt is before challenge issuedAt')
  }
  if (presentationCreatedAtValid && challengeExpiresAtValid && presentation.createdAt > challenge.expiresAt) {
    errors.push('presentation createdAt is after challenge expiry')
  }

  const replayed = usedChallengeSet(options.usedChallengeIds).has(challenge.id)
  if (replayed) errors.push('admission challenge has already been used')

  const signatureShapeValid = HEX128_RE.test(presentation.signature)
  const applicantShapeValid = HEX64_RE.test(presentation.applicantPubkey)
  if (!signatureShapeValid) errors.push('presentation signature must be a 128-character lowercase hex string')
  if (!applicantShapeValid) errors.push('presentation applicantPubkey must be a 64-character lowercase hex string')

  let signatureValid = false
  if (signatureShapeValid && applicantShapeValid) {
    try {
      signatureValid = schnorr.verify(
        hexToBytes(presentation.signature),
        presentationDigest(presentationPayload(presentation)),
        hexToBytes(presentation.applicantPubkey),
      )
    } catch {
      signatureValid = false
    }
    if (!signatureValid) errors.push('presentation signature is invalid')
  }

  return {
    applicantPubkey: presentation.applicantPubkey,
    audience: presentation.audience,
    challengeId: challenge.id,
    errors,
    replayed,
    signatureValid,
    valid: errors.length === 0,
  }
}

export function verifyAdmissionRequest(
  events: EventTemplate | readonly EventTemplate[],
  bundle: SignedDeploymentBundle,
  challenge: AdmissionChallenge,
  presentation: AdmissionPresentation,
  options: VerifyAdmissionRequestOptions = {},
): AdmissionRequestVerification {
  const presentationVerification = verifyAdmissionPresentation(presentation, challenge, {
    expectedApplicantPubkey: bundle.policy.expectedSubject,
    expectedAudience: options.expectedAudience,
    now: options.now,
    usedChallengeIds: options.usedChallengeIds,
  })
  const deployment = verifyProductionDeployment(events, bundle, options)
  const errors = [
    ...presentationVerification.errors,
    ...deployment.errors,
  ]

  if (bundle.policy.expectedSubject !== presentation.applicantPubkey) {
    errors.push('admission vouch subject does not match presentation applicant')
  }

  const revoked = revokedApplicantSet(options.revokedApplicantPubkeys).has(presentation.applicantPubkey)
  if (revoked) errors.push('admission applicant is revoked')

  const rank = firstRank(deployment)
  const valid = presentationVerification.valid && deployment.valid && !revoked
    && bundle.policy.expectedSubject === presentation.applicantPubkey
  const decision = revoked
    ? 'revoke'
    : valid
      ? decisionForRank(rank, options)
      : 'deny'

  return {
    applicantPubkey: presentation.applicantPubkey,
    decision,
    deployment,
    errors,
    presentation: presentationVerification,
    rank,
    valid,
  }
}
