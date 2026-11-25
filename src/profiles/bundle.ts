import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { matches } from '../nip85/shape.js'
import { isAuthenticBundle } from './authentic.js'
import { CodedErrors, issuesOf } from './coded.js'
import { verifyDeploymentPolicy } from './policy.js'
import { NOW_INVALID, verificationTime, withoutRepeatedTimeIssue } from './time.js'
import type { EventTemplate } from '../nip85/types.js'
import type { VerificationIssue } from './issues.js'
import type { DeploymentPolicyVerification, UseCaseDeploymentPolicy, VerifyDeploymentPolicyOptions } from './policy.js'
import type { UseCaseProfile } from './types.js'

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
  /** Reference timestamp for freshness checks. Defaults to the current time (fail closed). */
  now?: number
  trustedPublishers?: Iterable<string>
}

export interface SignedDeploymentBundleVerification {
  bundle: SignedDeploymentBundle
  errors: string[]
  issues?: VerificationIssue[]
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
  issues?: VerificationIssue[]
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
    // A number that is not finite has no JSON form: JSON.stringify would write
    // it as null, and so would sign `1e999` and `null` as the same value. One
    // could then be put in place of the other in a signed value.
    if (typeof child === 'number' && !Number.isFinite(child)) {
      throw new Error('a signed value cannot hold a number that is not finite')
    }
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      // Built from entries, not by assignment. Assigning to a key named
      // `__proto__` sets a prototype and writes nothing, so that one key would
      // never reach the digest: anything put under it in a signed value would
      // ride along unsigned. JSON.parse makes it an ordinary key, and so
      // does this.
      const source = child as Record<string, unknown>
      return Object.fromEntries(Object.keys(source).sort().map(key => [key, source[key]]))
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

function trustedPublisherSet(publishers: Iterable<string> | undefined, found: CodedErrors): Set<string> {
  if (publishers === undefined) {
    found.add('bundle.trusted_publishers_missing', 'no trusted bundle publishers configured')
    return new Set()
  }

  const trusted = new Set<string>()
  let count = 0
  for (const publisher of publishers) {
    count += 1
    if (!HEX64_RE.test(publisher)) {
      const place = `trustedPublishers[${count - 1}]`
      found.add('bundle.trusted_publisher_invalid', `${place} must be a 64-character lowercase hex string`, place)
      continue
    }
    trusted.add(publisher)
  }
  if (count === 0) found.add('bundle.trusted_publishers_missing', 'no trusted bundle publishers configured')
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
  given: SignedDeploymentBundle,
  options: VerifySignedDeploymentBundleOptions = {},
): SignedDeploymentBundleVerification {
  const found = new CodedErrors()
  // Undefined when the caller's now cannot be compared. Then nothing below is
  // compared against it, and the bundle fails for that instead.
  const now = verificationTime(options.now)
  if (now === undefined) found.add('verification.now_invalid', NOW_INVALID)
  const trustedPublishers = trustedPublisherSet(options.trustedPublishers, found)
  // A bundle is fetched, and what arrives can be anything. One that is not an
  // object reads as one with nothing in it, and so fails every check below.
  const bundle = (given !== null && typeof given === 'object' ? given : {}) as SignedDeploymentBundle

  if (bundle.version !== 1) found.add('bundle.version_invalid', 'bundle version must be 1')
  if (bundle.type !== DEPLOYMENT_BUNDLE_TYPE) found.add('bundle.type_invalid', `bundle type must be ${DEPLOYMENT_BUNDLE_TYPE}`)
  if (typeof bundle.id !== 'string' || bundle.id.trim() === '') found.add('bundle.id_invalid', 'bundle id must be non-empty')
  // Nothing below compares a date that is not a number, or tests a pattern
  // against a value that is not a string: either would first convert it, and
  // converting some objects throws
  const issuedAtValid = Number.isSafeInteger(bundle.issuedAt) && bundle.issuedAt >= 0
  if (!issuedAtValid) {
    found.add('bundle.issued_at_invalid', 'bundle issuedAt must be a non-negative Unix timestamp')
  }
  if (bundle.expiresAt !== undefined) {
    if (!Number.isSafeInteger(bundle.expiresAt) || bundle.expiresAt < 0) {
      found.add('bundle.expires_at_invalid', 'bundle expiresAt must be a non-negative Unix timestamp')
    } else if (issuedAtValid && bundle.expiresAt <= bundle.issuedAt) {
      found.add('bundle.expires_at_invalid', 'bundle expiresAt must be greater than issuedAt')
    } else if (now !== undefined && now > bundle.expiresAt) {
      found.add('bundle.expired', 'bundle is expired')
    }
  }
  if (now !== undefined && issuedAtValid && bundle.issuedAt > now) {
    found.add('bundle.issued_at_future', 'bundle issuedAt is in the future')
  }

  const signerShapeValid = matches(HEX64_RE, bundle.signer)
  const signatureShapeValid = matches(HEX128_RE, bundle.signature)
  if (!signerShapeValid) found.add('bundle.signer_invalid', 'bundle signer must be a 64-character lowercase hex string')
  if (!signatureShapeValid) found.add('bundle.signature_malformed', 'bundle signature must be a 128-character lowercase hex string')

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
    if (!signatureValid) found.add('bundle.signature_invalid', 'bundle signature is invalid')
  }

  const publisherTrusted = trustedPublishers.has(bundle.signer)
  if (!publisherTrusted && trustedPublishers.size > 0) {
    found.add('bundle.signer_untrusted', 'bundle signer is not trusted')
  }

  return {
    bundle: given,
    errors: found.errors,
    issues: found.issues,
    publisherTrusted,
    signatureValid,
    valid: found.length === 0,
  }
}

/**
 * The result for a policy that was not applied. Nothing in the policy is
 * checked: it is handed back as it was given, with the profile it names, and
 * no event is verified against it.
 */
function policyNotApplied(bundle: unknown): DeploymentPolicyVerification {
  const policy: unknown = bundle !== null && typeof bundle === 'object' ? (bundle as { policy?: unknown }).policy : undefined
  const profile: unknown = policy !== null && typeof policy === 'object' ? (policy as { profile?: unknown }).profile : undefined

  return {
    companionEvidence: Object.freeze({
      evidence: Object.freeze([]),
      errors: [],
      missingIds: Object.freeze([]),
      requirements: Object.freeze([]),
      valid: false,
    }),
    decision: 'reject',
    errors: [],
    issues: [],
    metrics: {},
    nostrSignatures: { checked: false, valid: false },
    policy: policy as UseCaseDeploymentPolicy,
    profileVerification: {
      valid: false,
      errors: [],
      issues: [],
      events: [],
      federation: undefined,
      profile: profile as UseCaseProfile,
    },
    publishers: { checked: false, valid: false },
    revokedCircleIds: [],
    supersededCircleIds: [],
    valid: false,
  }
}

export function verifyDeploymentBundle(
  events: EventTemplate | readonly EventTemplate[],
  bundle: SignedDeploymentBundle,
  options: VerifyDeploymentBundleOptions = {},
): DeploymentBundleVerification {
  const bundleVerification = verifySignedDeploymentBundle(bundle, options)
  // A policy is applied only from an authentic bundle. Anything else was
  // written by nobody the verifier knows: applying it would let that party
  // choose what is checked, and reading it would trust its shape. The result
  // is a rejection either way, for the reasons the bundle check has given.
  const deployment = isAuthenticBundle(bundleVerification)
    ? verifyDeploymentPolicy(events, bundle.policy, options)
    : policyNotApplied(bundle)
  // Both parts read the same now, and each reports one it cannot compare. The
  // errors are the issues' own messages, so the two lists cannot fall out of step.
  const issues = withoutRepeatedTimeIssue([
    ...issuesOf(bundleVerification),
    ...issuesOf(deployment),
  ])
  const errors = issues.map(issue => issue.message)

  return {
    bundle: bundleVerification,
    deployment,
    errors,
    issues,
    valid: bundleVerification.valid && deployment.valid,
  }
}
