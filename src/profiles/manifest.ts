import { computeCircleId } from '../proof/circle.js'

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

function validateSortedHexList(values: readonly string[], label: string, errors: string[]): void {
  if (values.length === 0) {
    errors.push(`${label} must contain at least one value`)
    return
  }
  for (let i = 0; i < values.length; i++) {
    if (!HEX64_RE.test(values[i])) {
      errors.push(`${label}[${i}] must be a 64-character lowercase hex string`)
    }
    if (i > 0) {
      if (values[i] < values[i - 1]) errors.push(`${label} must be sorted lexicographically`)
      if (values[i] === values[i - 1]) errors.push(`${label}[${i}] is duplicated`)
    }
  }
}

function validateOptionalHexList(values: readonly string[] | undefined, label: string, errors: string[]): void {
  if (values === undefined) return
  validateSortedHexList(values, label, errors)
}

function validateProfileIds(manifest: CircleManifest, profileId: string | undefined, errors: string[]): void {
  if (manifest.profileIds.length === 0) {
    errors.push('profileIds must contain at least one value')
  }
  const seen = new Set<string>()
  for (const [index, id] of manifest.profileIds.entries()) {
    if (id.trim() === '') errors.push(`profileIds[${index}] must be non-empty`)
    if (seen.has(id)) errors.push(`profileIds[${index}] is duplicated`)
    seen.add(id)
  }
  if (profileId !== undefined && !seen.has(profileId)) {
    errors.push(`manifest does not allow profile ${profileId}`)
  }
}

export function verifyCircleManifest(
  manifest: CircleManifest,
  options: VerifyCircleManifestOptions = {},
): CircleManifestVerification {
  const errors: string[] = []
  const revokedCircleIds = new Set(options.revokedCircleIds ?? [])

  if (manifest.version !== 1) errors.push('manifest version must be 1')
  if (manifest.name.trim() === '') errors.push('manifest name must be non-empty')
  if (manifest.purpose.trim() === '') errors.push('manifest purpose must be non-empty')
  validateSortedHexList(manifest.members, 'members', errors)
  validateProfileIds(manifest, options.profileId, errors)
  validateOptionalHexList(manifest.revokedCircleIds, 'revokedCircleIds', errors)
  validateOptionalHexList(manifest.supersedes, 'supersedes', errors)

  const computedCircleId = computeCircleId([...manifest.members])
  if (!HEX64_RE.test(manifest.circleId)) {
    errors.push('circleId must be a 64-character lowercase hex string')
  } else if (manifest.circleId !== computedCircleId) {
    errors.push('circleId does not match manifest members')
  }

  if (!Number.isSafeInteger(manifest.issuedAt) || manifest.issuedAt < 0) {
    errors.push('issuedAt must be a non-negative Unix timestamp')
  }
  if (manifest.expiresAt !== undefined) {
    if (!Number.isSafeInteger(manifest.expiresAt) || manifest.expiresAt < 0) {
      errors.push('expiresAt must be a non-negative Unix timestamp')
    } else if (manifest.expiresAt <= manifest.issuedAt) {
      errors.push('expiresAt must be greater than issuedAt')
    } else if (options.now !== undefined && options.now > manifest.expiresAt) {
      errors.push('manifest is expired')
    }
  }
  if (options.now !== undefined && manifest.issuedAt > options.now) {
    errors.push('manifest issuedAt is in the future')
  }

  if (manifest.status !== 'active' && manifest.status !== 'revoked' && manifest.status !== 'superseded') {
    errors.push('manifest status must be active, revoked, or superseded')
  }
  if (manifest.status === 'revoked') errors.push('manifest is revoked')
  if (manifest.status === 'superseded' && options.allowSuperseded !== true) {
    errors.push('manifest is superseded')
  }
  if (revokedCircleIds.has(manifest.circleId)) {
    errors.push('manifest circle is revoked by deployment policy')
  }

  return {
    circleId: HEX64_RE.test(manifest.circleId) ? manifest.circleId : null,
    errors,
    manifest,
    valid: errors.length === 0,
  }
}

function addAll(target: Set<string>, values: readonly string[] | undefined): void {
  for (const value of values ?? []) target.add(value)
}

export function resolveCircleManifests(
  manifests: readonly CircleManifest[],
  options: ResolveCircleManifestsOptions = {},
): CircleManifestResolution {
  const errors: string[] = []
  const accepted = new Set<string>()
  const revoked = new Set<string>()
  const superseded = new Set<string>()

  for (const manifest of manifests) {
    addAll(revoked, manifest.revokedCircleIds)
    addAll(superseded, manifest.supersedes)
    if (manifest.status === 'revoked') revoked.add(manifest.circleId)
    if (manifest.status === 'superseded') superseded.add(manifest.circleId)
  }

  for (const [index, manifest] of manifests.entries()) {
    const verification = verifyCircleManifest(manifest, {
      allowSuperseded: options.allowSuperseded,
      now: options.now,
      profileId: options.profileId,
      revokedCircleIds: revoked,
    })

    if (!verification.valid) {
      errors.push(...verification.errors.map(error => `manifest[${index}]: ${error}`))
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
    errors,
    revokedCircleIds: [...revoked].sort(),
    supersededCircleIds: [...superseded].sort(),
    valid: errors.length === 0,
  }
}
