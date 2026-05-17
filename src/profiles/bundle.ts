import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { issuesFromErrors } from './issues.js'
import { verifyDeploymentPolicy } from './policy.js'
import type { EventTemplate } from '../nip85/types.js'
import type { VerificationIssue } from './issues.js'
import type { DeploymentPolicyVerification, UseCaseDeploymentPolicy, VerifyDeploymentPolicyOptions } from './policy.js'

export const DEPLOYMENT_BUNDLE_TYPE = 'nostr-veil-deployment-bundle'

export interface DeploymentBundlePayload {
  version: 1
  type: typeof DEPLOYMENT_BUNDLE_TYPE
  expiresAt?: number
  id: string
  issuedAt: number
  policy: UseCaseDeploymentPolicy
  signer: string
}

export interface SignedDeploymentBundle extends DeploymentBundlePayload {
  signature: string
}

export interface CreateSignedDeploymentBundleOptions {
  expiresAt?: number
  id: string
  issuedAt: number
  privateKey: string
}

export interface VerifySignedDeploymentBundleOptions {
  now?: number
  trustedPublishers?: Iterable<string>
}

export interface SignedDeploymentBundleVerification {
  bundle: SignedDeploymentBundle
  errors: string[]
  issues: VerificationIssue[]
  publisherTrusted: boolean
  signatureValid: boolean
  valid: boolean
}

export interface VerifyDeploymentBundleOptions extends VerifyDeploymentPolicyOptions {
  trustedPublishers?: Iterable<string>
}

export interface DeploymentBundleVerification {
  bundle: SignedDeploymentBundleVerification
  deployment: DeploymentPolicyVerification
  errors: string[]
  issues: VerificationIssue[]
  valid: boolean
}

const HEX64_RE = /^[0-9a-f]{64}$/
const HEX128_RE = /^[0-9a-f]{128}$/

function assertHex64(value: string, label: string): void {
  if (!HEX64_RE.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`)
  }
}

function assertSafeUnix(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative Unix timestamp`)
  }
}

function assertNonEmpty(value: string, label: string): string {
  if (value.trim() === '') throw new Error(`${label} must be non-empty`)
  return value
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

function deploymentBundleDigest(payload: DeploymentBundlePayload): Uint8Array {
  const encoded = new TextEncoder().encode(`${DEPLOYMENT_BUNDLE_TYPE}:v1\n${stableStringify(payload)}`)
  return sha256(encoded)
}

function payloadFromBundle(bundle: SignedDeploymentBundle): DeploymentBundlePayload {
  return {
    version: bundle.version,
    type: bundle.type,
    ...(bundle.expiresAt === undefined ? {} : { expiresAt: bundle.expiresAt }),
    id: bundle.id,
    issuedAt: bundle.issuedAt,
    policy: bundle.policy,
    signer: bundle.signer,
  }
}

function trustedPublisherSet(publishers: Iterable<string> | undefined, errors: string[]): Set<string> {
  if (publishers === undefined) {
    errors.push('no trusted bundle publishers configured')
    return new Set()
  }

  const trusted = new Set<string>()
  let count = 0
  for (const publisher of publishers) {
    count += 1
    if (!HEX64_RE.test(publisher)) {
      errors.push(`trustedPublishers[${count - 1}] must be a 64-character lowercase hex string`)
      continue
    }
    trusted.add(publisher)
  }
  if (count === 0) errors.push('no trusted bundle publishers configured')
  return trusted
}

export function createSignedDeploymentBundle(
  policy: UseCaseDeploymentPolicy,
  options: CreateSignedDeploymentBundleOptions,
): SignedDeploymentBundle {
  assertNonEmpty(options.id, 'id')
  assertSafeUnix(options.issuedAt, 'issuedAt')
  assertSafeUnix(options.expiresAt, 'expiresAt')
  if (options.expiresAt !== undefined && options.expiresAt <= options.issuedAt) {
    throw new Error('expiresAt must be greater than issuedAt')
  }
  assertHex64(options.privateKey, 'privateKey')

  const signer = bytesToHex(schnorr.getPublicKey(hexToBytes(options.privateKey)))
  const payload: DeploymentBundlePayload = {
    version: 1,
    type: DEPLOYMENT_BUNDLE_TYPE,
    ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
    id: options.id,
    issuedAt: options.issuedAt,
    policy,
    signer,
  }
  const signature = bytesToHex(schnorr.sign(deploymentBundleDigest(payload), hexToBytes(options.privateKey)))

  return Object.freeze({
    ...payload,
    signature,
  })
}

export function verifySignedDeploymentBundle(
  bundle: SignedDeploymentBundle,
  options: VerifySignedDeploymentBundleOptions = {},
): SignedDeploymentBundleVerification {
  const errors: string[] = []
  const trustedPublishers = trustedPublisherSet(options.trustedPublishers, errors)

  if (bundle.version !== 1) errors.push('bundle version must be 1')
  if (bundle.type !== DEPLOYMENT_BUNDLE_TYPE) errors.push(`bundle type must be ${DEPLOYMENT_BUNDLE_TYPE}`)
  if (bundle.id.trim() === '') errors.push('bundle id must be non-empty')
  if (!Number.isSafeInteger(bundle.issuedAt) || bundle.issuedAt < 0) {
    errors.push('bundle issuedAt must be a non-negative Unix timestamp')
  }
  if (bundle.expiresAt !== undefined) {
    if (!Number.isSafeInteger(bundle.expiresAt) || bundle.expiresAt < 0) {
      errors.push('bundle expiresAt must be a non-negative Unix timestamp')
    } else if (bundle.expiresAt <= bundle.issuedAt) {
      errors.push('bundle expiresAt must be greater than issuedAt')
    } else if (options.now !== undefined && options.now > bundle.expiresAt) {
      errors.push('bundle is expired')
    }
  }
  if (options.now !== undefined && bundle.issuedAt > options.now) {
    errors.push('bundle issuedAt is in the future')
  }

  const signerShapeValid = HEX64_RE.test(bundle.signer)
  const signatureShapeValid = HEX128_RE.test(bundle.signature)
  if (!signerShapeValid) errors.push('bundle signer must be a 64-character lowercase hex string')
  if (!signatureShapeValid) errors.push('bundle signature must be a 128-character lowercase hex string')

  let signatureValid = false
  if (signerShapeValid && signatureShapeValid) {
    try {
      signatureValid = schnorr.verify(
        hexToBytes(bundle.signature),
        deploymentBundleDigest(payloadFromBundle(bundle)),
        hexToBytes(bundle.signer),
      )
    } catch {
      signatureValid = false
    }
    if (!signatureValid) errors.push('bundle signature is invalid')
  }

  const publisherTrusted = trustedPublishers.has(bundle.signer)
  if (!publisherTrusted && trustedPublishers.size > 0) {
    errors.push('bundle signer is not trusted')
  }

  return {
    bundle,
    errors,
    issues: issuesFromErrors(errors),
    publisherTrusted,
    signatureValid,
    valid: errors.length === 0,
  }
}

export function verifyDeploymentBundle(
  events: EventTemplate | readonly EventTemplate[],
  bundle: SignedDeploymentBundle,
  options: VerifyDeploymentBundleOptions = {},
): DeploymentBundleVerification {
  const bundleVerification = verifySignedDeploymentBundle(bundle, options)
  const deployment = verifyDeploymentPolicy(events, bundle.policy, options)
  const errors = [
    ...bundleVerification.errors,
    ...deployment.errors,
  ]
  const issues = [
    ...bundleVerification.issues,
    ...deployment.issues,
  ]

  return {
    bundle: bundleVerification,
    deployment,
    errors,
    issues,
    valid: bundleVerification.valid && deployment.valid,
  }
}
