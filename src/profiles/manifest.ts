import { computeCircleId } from '../proof/circle.js'
import { CodedErrors, issuesOf } from './coded.js'
import { manifestFieldProblems } from './fields.js'
import { NOW_INVALID, verificationTime } from './time.js'
import type { VerificationIssueCode } from './issues.js'

export type CircleManifestStatus = 'active' | 'revoked' | 'superseded'

export interface CircleManifest {
  version: 1
  circleId: string
  contact?: string
  evidenceProcess?: string
  expiresAt?: number
  issuedAt: number
  members: readonly string[]
  name: string
  policyUri?: string
  profileIds: readonly string[]
  purpose: string
  revokedCircleIds?: readonly string[]
  status: CircleManifestStatus
  supersedes?: readonly string[]
}

export interface CreateCircleManifestOptions {
  contact?: string
  evidenceProcess?: string
  expiresAt?: number
  issuedAt: number
  members: readonly string[]
  name: string
  policyUri?: string
  profileIds: readonly string[]
  purpose: string
  revokedCircleIds?: readonly string[]
  status?: CircleManifestStatus
  supersedes?: readonly string[]
}

export interface VerifyCircleManifestOptions {
  allowSuperseded?: boolean
  /** Reference timestamp for freshness checks. Defaults to the current time (fail closed). */
  now?: number
  profileId?: string
  revokedCircleIds?: Iterable<string>
}

export interface CircleManifestVerification {
  circleId: string | null
  errors: string[]
  manifest: CircleManifest
  valid: boolean
}

export interface ResolveCircleManifestsOptions {
  allowSuperseded?: boolean
  /** Reference timestamp for freshness checks. Defaults to the current time (fail closed). */
  now?: number
  profileId?: string
}

export interface CircleManifestResolution {
  acceptedCircleIds: string[]
  errors: string[]
  revokedCircleIds: string[]
  supersededCircleIds: string[]
  valid: boolean
}

const HEX64_RE = /^[0-9a-f]{64}$/

function assertHex64(value: string, label: string): void {
  if (!HEX64_RE.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`)
  }
}

function assertNonEmpty(value: string, label: string): string {
  if (value.trim() === '') throw new Error(`${label} must be non-empty`)
  return value
}

function assertSafeUnix(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative Unix timestamp`)
  }
}

function sortedUniqueHex(values: readonly string[], label: string): readonly string[] {
  if (values.length === 0) throw new Error(`${label} must contain at least one value`)
  const sorted = [...values].sort()
  for (let i = 0; i < sorted.length; i++) {
    assertHex64(sorted[i], `${label}[${i}]`)
    if (i > 0 && sorted[i] === sorted[i - 1]) {
      throw new Error(`${label}[${i}] is duplicated`)
    }
  }
  return Object.freeze(sorted)
}

function optionalSortedUniqueHex(values: readonly string[] | undefined, label: string): readonly string[] | undefined {
  if (values === undefined || values.length === 0) return undefined
  return sortedUniqueHex(values, label)
}

function profileIds(values: readonly string[]): readonly string[] {
  if (values.length === 0) throw new Error('profileIds must contain at least one value')
  const seen = new Set<string>()
  return Object.freeze(values.map((id, index) => {
    if (id.trim() === '') throw new Error(`profileIds[${index}] must be non-empty`)
    if (seen.has(id)) throw new Error(`profileIds[${index}] is duplicated`)
    seen.add(id)
    return id
  }))
}

function tagString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (value.trim() === '') throw new Error('optional manifest strings must be non-empty when supplied')
  return value
}

function manifestStatus(value: CircleManifestStatus | undefined): CircleManifestStatus {
  if (value === undefined) return 'active'
  if (value !== 'active' && value !== 'revoked' && value !== 'superseded') {
    throw new Error('status must be active, revoked, or superseded')
  }
  return value
}

export function createCircleManifest(options: CreateCircleManifestOptions): CircleManifest {
  assertSafeUnix(options.issuedAt, 'issuedAt')
  assertSafeUnix(options.expiresAt, 'expiresAt')
  if (options.expiresAt !== undefined && options.expiresAt <= options.issuedAt) {
    throw new Error('expiresAt must be greater than issuedAt')
  }

  const members = sortedUniqueHex(options.members, 'members')
  const contact = tagString(options.contact)
  const evidenceProcess = tagString(options.evidenceProcess)
  const policyUri = tagString(options.policyUri)
  const revokedCircleIds = optionalSortedUniqueHex(options.revokedCircleIds, 'revokedCircleIds')
  const supersedes = optionalSortedUniqueHex(options.supersedes, 'supersedes')
  const manifest: CircleManifest = {
    version: 1,
    circleId: computeCircleId([...members]),
    ...(contact === undefined ? {} : { contact }),
    ...(evidenceProcess === undefined ? {} : { evidenceProcess }),
    ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
    issuedAt: options.issuedAt,
    members,
    name: assertNonEmpty(options.name, 'name'),
    ...(policyUri === undefined ? {} : { policyUri }),
    profileIds: profileIds(options.profileIds),
    purpose: assertNonEmpty(options.purpose, 'purpose'),
    ...(revokedCircleIds === undefined ? {} : { revokedCircleIds }),
    status: manifestStatus(options.status),
    ...(supersedes === undefined ? {} : { supersedes }),
  }

  return Object.freeze(manifest)
}

/**
 * A fault in the shape of a manifest that has no issue code of its own. The
 * faults in `members`, `profileIds`, `revokedCircleIds` and `circleId` are
 * filed as `circle.manifest_invalid`. The rest have always been filed under
 * the general code, and still are.
 */
const UNCODED: VerificationIssueCode = 'verification.failed'

function validateSortedHexList(
  values: readonly string[],
  label: string,
  code: VerificationIssueCode,
  found: CodedErrors,
): void {
  if (values.length === 0) {
    found.add(code, `${label} must contain at least one value`)
    return
  }
  for (let i = 0; i < values.length; i++) {
    if (!HEX64_RE.test(values[i])) {
      found.add(code, `${label}[${i}] must be a 64-character lowercase hex string`)
    }
    if (i > 0) {
      if (values[i] < values[i - 1]) found.add(code, `${label} must be sorted lexicographically`)
      if (values[i] === values[i - 1]) found.add(code, `${label}[${i}] is duplicated`)
    }
  }
}

function validateOptionalHexList(
  values: readonly string[] | undefined,
  label: string,
  code: VerificationIssueCode,
  found: CodedErrors,
): void {
  if (values === undefined) return
  validateSortedHexList(values, label, code, found)
}

function validateProfileIds(manifest: CircleManifest, profileId: string | undefined, found: CodedErrors): void {
  if (manifest.profileIds.length === 0) {
    found.add('circle.manifest_invalid', 'profileIds must contain at least one value')
  }
  const seen = new Set<string>()
  for (const [index, id] of manifest.profileIds.entries()) {
    if (id.trim() === '') found.add('circle.manifest_invalid', `profileIds[${index}] must be non-empty`)
    if (seen.has(id)) found.add('circle.manifest_invalid', `profileIds[${index}] is duplicated`)
    seen.add(id)
  }
  if (profileId !== undefined && !seen.has(profileId)) {
    found.add('circle.profile_not_allowed', `manifest does not allow profile ${profileId}`)
  }
}

export function verifyCircleManifest(
  manifest: CircleManifest,
  options: VerifyCircleManifestOptions = {},
): CircleManifestVerification {
  // A manifest can arrive inside a policy read from JSON. One with a field of
  // the wrong type is reported and nothing else is checked: read as it stood,
  // the field would make this throw.
  const problems = manifestFieldProblems(manifest, 'manifest')
  if (problems.length > 0) {
    const found = new CodedErrors()
    for (const problem of problems) found.add('circle.manifest_field_invalid', problem.message, problem.path)
    if (verificationTime(options.now) === undefined) found.add('verification.now_invalid', NOW_INVALID)
    // The circle id it states is still given back where it is well formed
    const stated: unknown = manifest !== null && typeof manifest === 'object'
      ? (manifest as { circleId?: unknown }).circleId
      : undefined
    return { circleId: typeof stated === 'string' && HEX64_RE.test(stated) ? stated : null, errors: found.errors, manifest, valid: false }
  }
  const now = verificationTime(options.now)
  return verifyManifestAt(manifest, options, now, now === undefined)
}

/**
 * Verify one manifest against a time already resolved. `now` is undefined when
 * the caller's value cannot be compared; then no expiry is compared against
 * it. `reportTime` is false when the caller has reported that for the whole
 * set, so that each manifest does not repeat it.
 */
function verifyManifestAt(
  manifest: CircleManifest,
  options: VerifyCircleManifestOptions,
  now: number | undefined,
  reportTime: boolean,
): CircleManifestVerification {
  const found = new CodedErrors()
  if (reportTime) found.add('verification.now_invalid', NOW_INVALID)
  const revokedCircleIds = new Set(options.revokedCircleIds ?? [])

  if (manifest.version !== 1) found.add(UNCODED, 'manifest version must be 1')
  if (manifest.name.trim() === '') found.add(UNCODED, 'manifest name must be non-empty')
  if (manifest.purpose.trim() === '') found.add(UNCODED, 'manifest purpose must be non-empty')
  validateSortedHexList(manifest.members, 'members', 'circle.manifest_invalid', found)
  validateProfileIds(manifest, options.profileId, found)
  validateOptionalHexList(manifest.revokedCircleIds, 'revokedCircleIds', 'circle.manifest_invalid', found)
  validateOptionalHexList(manifest.supersedes, 'supersedes', UNCODED, found)

  const computedCircleId = computeCircleId([...manifest.members])
  if (!HEX64_RE.test(manifest.circleId)) {
    found.add('circle.manifest_invalid', 'circleId must be a 64-character lowercase hex string')
  } else if (manifest.circleId !== computedCircleId) {
    found.add('circle.manifest_invalid', 'circleId does not match manifest members')
  }

  if (!Number.isSafeInteger(manifest.issuedAt) || manifest.issuedAt < 0) {
    found.add(UNCODED, 'issuedAt must be a non-negative Unix timestamp')
  }
  if (manifest.expiresAt !== undefined) {
    if (!Number.isSafeInteger(manifest.expiresAt) || manifest.expiresAt < 0) {
      found.add(UNCODED, 'expiresAt must be a non-negative Unix timestamp')
    } else if (manifest.expiresAt <= manifest.issuedAt) {
      found.add(UNCODED, 'expiresAt must be greater than issuedAt')
    } else if (now !== undefined && now > manifest.expiresAt) {
      found.add('circle.manifest_expired', 'manifest is expired')
    }
  }
  if (now !== undefined && manifest.issuedAt > now) {
    found.add(UNCODED, 'manifest issuedAt is in the future')
  }

  if (manifest.status !== 'active' && manifest.status !== 'revoked' && manifest.status !== 'superseded') {
    found.add(UNCODED, 'manifest status must be active, revoked, or superseded')
  }
  if (manifest.status === 'revoked') found.add('circle.revoked', 'manifest is revoked')
  if (manifest.status === 'superseded' && options.allowSuperseded !== true) {
    found.add('circle.superseded', 'manifest is superseded')
  }
  if (revokedCircleIds.has(manifest.circleId)) {
    found.add('circle.revoked', 'manifest circle is revoked by deployment policy')
  }

  return {
    circleId: HEX64_RE.test(manifest.circleId) ? manifest.circleId : null,
    errors: found.errors,
    manifest,
    valid: found.length === 0,
  }
}

function addAll(target: Set<string>, values: readonly string[] | undefined): void {
  for (const value of values ?? []) target.add(value)
}

export function resolveCircleManifests(
  manifests: readonly CircleManifest[],
  options: ResolveCircleManifestsOptions = {},
): CircleManifestResolution {
  const found = new CodedErrors()
  const list: unknown = manifests
  if (!Array.isArray(list)) {
    found.add('circle.manifest_field_invalid', 'manifests must be a list', 'manifests')
    if (verificationTime(options.now) === undefined) found.add('verification.now_invalid', NOW_INVALID)
    return { acceptedCircleIds: [], errors: found.errors, revokedCircleIds: [], supersededCircleIds: [], valid: false }
  }
  // Each manifest's lists are read below before any manifest is verified, so a
  // manifest with a field of the wrong type is reported first, and none of its
  // fields is read
  const malformed = new Set<number>()
  for (let index = 0; index < list.length; index++) {
    for (const problem of manifestFieldProblems(list[index], `manifest[${index}]`)) {
      found.add('circle.manifest_field_invalid', problem.message, problem.path)
      malformed.add(index)
    }
  }

  const accepted = new Set<string>()
  const revoked = new Set<string>()
  const superseded = new Set<string>()
  // Reported once here for the whole set, not by each manifest
  const now = verificationTime(options.now)
  if (now === undefined) found.add('verification.now_invalid', NOW_INVALID)

  for (const [index, manifest] of manifests.entries()) {
    if (malformed.has(index)) continue
    addAll(revoked, manifest.revokedCircleIds)
    addAll(superseded, manifest.supersedes)
    if (manifest.status === 'revoked') revoked.add(manifest.circleId)
    if (manifest.status === 'superseded') superseded.add(manifest.circleId)
  }
  // No circle is accepted from a set that could not be read in full. What the
  // well-formed manifests in it revoke or supersede still stands.
  if (malformed.size > 0) {
    return {
      acceptedCircleIds: [],
      errors: found.errors,
      revokedCircleIds: [...revoked].sort(),
      supersededCircleIds: [...superseded].sort(),
      valid: false,
    }
  }

  for (const [index, manifest] of manifests.entries()) {
    const verification = verifyManifestAt(manifest, {
      allowSuperseded: options.allowSuperseded,
      profileId: options.profileId,
      revokedCircleIds: revoked,
    }, now, false)

    if (!verification.valid) {
      // Each keeps the code it was raised with, and gains the manifest's place
      const place = `manifest[${index}]`
      for (const issue of issuesOf(verification)) found.add(issue.code, `${place}: ${issue.message}`, place)
      continue
    }
    if (manifest.status === 'active') {
      accepted.add(manifest.circleId)
    } else if (manifest.status === 'superseded' && options.allowSuperseded === true) {
      accepted.add(manifest.circleId)
    }
  }

  for (const circleId of revoked) accepted.delete(circleId)
  if (options.allowSuperseded !== true) {
    for (const circleId of superseded) accepted.delete(circleId)
  }

  return {
    acceptedCircleIds: [...accepted].sort(),
    errors: found.errors,
    revokedCircleIds: [...revoked].sort(),
    supersededCircleIds: [...superseded].sort(),
    valid: found.length === 0,
  }
}
