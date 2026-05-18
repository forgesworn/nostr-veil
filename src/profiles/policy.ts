import { verifySignedEvent } from '../signing.js'
import { issuesFromErrors } from './issues.js'
import { resolveCircleManifests } from './manifest.js'
import { verifyUseCaseProfile } from './verify.js'
import type { EventTemplate } from '../nip85/types.js'
import type { AggregateFn } from '../proof/types.js'
import type { SignedEvent } from '../signing.js'
import type { VerificationIssue } from './issues.js'
import type { CircleManifest } from './manifest.js'
import type { UseCaseProfile, UseCaseProfileVerification } from './types.js'

const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

export type DeploymentDecision = 'accept' | 'reject'

export interface DeploymentMetricPolicy {
  /** Require the metric tag to be present on every checked assertion event. */
  required?: boolean
  /** Inclusive lower bound for the published metric value. */
  min?: number
  /** Inclusive upper bound for the published metric value. */
  max?: number
  /** Require an integer value. Useful for count-like metrics. */
  integer?: boolean
}

export type CompanionEvidenceStatus = 'pass' | 'fail'

export interface CompanionEvidenceRequirement {
  /** Stable evidence check id, for example `npm-provenance` or `nip05-resolution`. */
  id: string
  /** Optional human label for reports and signed deployment bundles. */
  label?: string
  /** Require the evidence subject to match this canonical subject. */
  expectedSubject?: string
  /** Require checkedAt to be inside this freshness window. Zero disables freshness. */
  maxAgeSeconds?: number
  /** Defaults to true. Optional checks are recorded but do not fail when absent. */
  required?: boolean
}

export interface CompanionEvidence {
  checkedAt?: number
  id: string
  status: CompanionEvidenceStatus
  subject?: string
  summary?: string
}

export interface CompanionEvidenceVerification {
  evidence: readonly CompanionEvidence[]
  errors: string[]
  missingIds: readonly string[]
  requirements: readonly CompanionEvidenceRequirement[]
  valid: boolean
}

export interface CreateDeploymentPolicyOptions {
  acceptedCircleIds?: readonly string[]
  allowSupersededCircleIds?: boolean
  circleManifests?: readonly CircleManifest[]
  companionEvidence?: readonly CompanionEvidenceRequirement[]
  expectedSubject: string
  expectedSubjectTagValue?: string
  id?: string
  maxAgeSeconds?: number
  metricPolicies?: Readonly<Record<string, DeploymentMetricPolicy>>
  minDistinctSigners?: number
  rejectUnknownMetrics?: boolean
  requireNostrSignature?: boolean
}

export interface UseCaseDeploymentPolicy {
  acceptedCircleIds: readonly string[]
  allowSupersededCircleIds: boolean
  circleManifests: readonly CircleManifest[]
  companionEvidence?: readonly CompanionEvidenceRequirement[]
  expectedSubject: string
  expectedSubjectTagValue?: string
  id: string
  maxAgeSeconds: number
  metricPolicies: Readonly<Record<string, DeploymentMetricPolicy>>
  minDistinctSigners: number
  profile: UseCaseProfile
  rejectUnknownMetrics: boolean
  requireNostrSignature: boolean
}

export interface VerifyDeploymentPolicyOptions {
  aggregateFn?: AggregateFn
  companionEvidence?: readonly CompanionEvidence[]
  now?: number
}

export interface DeploymentPolicyVerification {
  companionEvidence: CompanionEvidenceVerification
  decision: DeploymentDecision
  errors: string[]
  issues?: VerificationIssue[]
  metrics: Record<string, number[]>
  nostrSignatures: {
    checked: boolean
    valid: boolean
  }
  policy: UseCaseDeploymentPolicy
  profileVerification: UseCaseProfileVerification
  revokedCircleIds: string[]
  supersededCircleIds: string[]
  valid: boolean
}

function normaliseEvents(events: EventTemplate | readonly EventTemplate[]): EventTemplate[] {
  return Array.isArray(events) ? [...events] : [events as EventTemplate]
}

function assertFinite(value: number | undefined, label: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function assertMetricPolicy(name: string, policy: DeploymentMetricPolicy): void {
  assertFinite(policy.min, `metricPolicies.${name}.min`)
  assertFinite(policy.max, `metricPolicies.${name}.max`)
  if (policy.min !== undefined && policy.max !== undefined && policy.min > policy.max) {
    throw new Error(`metricPolicies.${name}.min must be <= max`)
  }
}

function cloneMetricPolicies(
  policies: Readonly<Record<string, DeploymentMetricPolicy>> | undefined,
): Readonly<Record<string, DeploymentMetricPolicy>> {
  const entries = Object.entries(policies ?? {})
  const cloned: Record<string, DeploymentMetricPolicy> = {}

  for (const [name, policy] of entries) {
    if (name.trim() === '') throw new Error('metric policy name must be non-empty')
    assertMetricPolicy(name, policy)
    cloned[name] = Object.freeze({ ...policy })
  }

  return Object.freeze(cloned)
}

function assertEvidenceRequirement(requirement: CompanionEvidenceRequirement, index: number): CompanionEvidenceRequirement {
  const id = requirement.id.trim()
  if (id === '') throw new Error(`companionEvidence[${index}].id must be non-empty`)
  assertNonNegativeInteger(requirement.maxAgeSeconds ?? 0, `companionEvidence[${index}].maxAgeSeconds`)
  if (requirement.expectedSubject !== undefined && requirement.expectedSubject.trim() === '') {
    throw new Error(`companionEvidence[${index}].expectedSubject must be non-empty`)
  }
  if (requirement.label !== undefined && requirement.label.trim() === '') {
    throw new Error(`companionEvidence[${index}].label must be non-empty`)
  }

  return Object.freeze({
    id,
    ...(requirement.label === undefined ? {} : { label: requirement.label }),
    ...(requirement.expectedSubject === undefined ? {} : { expectedSubject: requirement.expectedSubject }),
    ...(requirement.maxAgeSeconds === undefined ? {} : { maxAgeSeconds: requirement.maxAgeSeconds }),
    required: requirement.required ?? true,
  })
}

function cloneCompanionEvidenceRequirements(
  requirements: readonly CompanionEvidenceRequirement[] | undefined,
): readonly CompanionEvidenceRequirement[] {
  const cloned: CompanionEvidenceRequirement[] = []
  const seen = new Set<string>()

  for (const [index, requirement] of (requirements ?? []).entries()) {
    const checked = assertEvidenceRequirement(requirement, index)
    if (seen.has(checked.id)) throw new Error(`companionEvidence[${index}].id is duplicated`)
    seen.add(checked.id)
    cloned.push(checked)
  }

  return Object.freeze(cloned)
}

function assertHex64(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`)
  }
}

function acceptedCircleIds(ids: readonly string[]): readonly string[] {
  if (ids.length === 0) {
    throw new Error('acceptedCircleIds must contain at least one circle id')
  }

  const seen = new Set<string>()
  const cloned = ids.map((id, index) => {
    assertHex64(id, `acceptedCircleIds[${index}]`)
    if (seen.has(id)) throw new Error(`acceptedCircleIds[${index}] is duplicated`)
    seen.add(id)
    return id
  })

  return Object.freeze(cloned)
}

function optionalAcceptedCircleIds(ids: readonly string[] | undefined): readonly string[] {
  if (ids === undefined || ids.length === 0) return Object.freeze([])
  return acceptedCircleIds(ids)
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function resolvedAcceptedCircleIds(
  profile: UseCaseProfile,
  rawCircleIds: readonly string[],
  manifests: readonly CircleManifest[],
  allowSupersededCircleIds: boolean,
  now?: number,
): {
  acceptedCircleIds: string[]
  errors: string[]
  revokedCircleIds: string[]
  supersededCircleIds: string[]
} {
  const accepted = new Set(rawCircleIds)
  const manifestResolution = resolveCircleManifests(manifests, {
    allowSuperseded: allowSupersededCircleIds,
    now,
    profileId: profile.id,
  })

  for (const circleId of manifestResolution.acceptedCircleIds) {
    accepted.add(circleId)
  }
  for (const circleId of manifestResolution.revokedCircleIds) {
    accepted.delete(circleId)
  }
  if (!allowSupersededCircleIds) {
    for (const circleId of manifestResolution.supersededCircleIds) {
      accepted.delete(circleId)
    }
  }

  return {
    acceptedCircleIds: [...accepted].sort(),
    errors: manifestResolution.errors,
    revokedCircleIds: manifestResolution.revokedCircleIds,
    supersededCircleIds: manifestResolution.supersededCircleIds,
  }
}

export function createDeploymentPolicy(
  profile: UseCaseProfile,
  options: CreateDeploymentPolicyOptions,
): UseCaseDeploymentPolicy {
  if (options.expectedSubject.trim() === '') throw new Error('expectedSubject must be non-empty')

  const maxAgeSeconds = options.maxAgeSeconds ?? profile.maxAgeSeconds
  const minDistinctSigners = options.minDistinctSigners ?? profile.minDistinctSigners
  assertNonNegativeInteger(maxAgeSeconds, 'maxAgeSeconds')
  assertPositiveInteger(minDistinctSigners, 'minDistinctSigners')
  const rawCircleIds = optionalAcceptedCircleIds(options.acceptedCircleIds)
  const circleManifests = Object.freeze([...(options.circleManifests ?? [])])
  const allowSupersededCircleIds = options.allowSupersededCircleIds ?? false
  const circleResolution = resolvedAcceptedCircleIds(
    profile,
    rawCircleIds,
    circleManifests,
    allowSupersededCircleIds,
  )
  if (circleResolution.errors.length > 0) {
    throw new Error(circleResolution.errors.join('; '))
  }
  if (circleResolution.acceptedCircleIds.length === 0) {
    throw new Error('acceptedCircleIds or circleManifests must supply at least one active circle')
  }
  const companionEvidence = cloneCompanionEvidenceRequirements(options.companionEvidence)

  return Object.freeze({
    acceptedCircleIds: rawCircleIds,
    allowSupersededCircleIds,
    circleManifests,
    ...(companionEvidence.length === 0 ? {} : { companionEvidence }),
    expectedSubject: options.expectedSubject,
    ...(options.expectedSubjectTagValue === undefined ? {} : { expectedSubjectTagValue: options.expectedSubjectTagValue }),
    id: options.id ?? profile.id,
    maxAgeSeconds,
    metricPolicies: cloneMetricPolicies(options.metricPolicies),
    minDistinctSigners,
    profile,
    rejectUnknownMetrics: options.rejectUnknownMetrics ?? false,
    requireNostrSignature: options.requireNostrSignature ?? false,
  })
}

function cloneCompanionEvidence(evidence: CompanionEvidence): CompanionEvidence {
  return Object.freeze({
    id: evidence.id,
    status: evidence.status,
    ...(evidence.checkedAt === undefined ? {} : { checkedAt: evidence.checkedAt }),
    ...(evidence.subject === undefined ? {} : { subject: evidence.subject }),
    ...(evidence.summary === undefined ? {} : { summary: evidence.summary }),
  })
}

function companionEvidenceById(
  evidence: readonly CompanionEvidence[] | undefined,
  errors: string[],
): Map<string, CompanionEvidence> {
  const byId = new Map<string, CompanionEvidence>()

  for (const [index, item] of (evidence ?? []).entries()) {
    const id = item.id.trim()
    if (id === '') {
      errors.push(`companion evidence[${index}] id must be non-empty`)
      continue
    }
    if (byId.has(id)) {
      errors.push(`companion evidence "${id}" is duplicated`)
      continue
    }
    if (item.status !== 'pass' && item.status !== 'fail') {
      errors.push(`companion evidence "${id}" status is invalid`)
      continue
    }
    byId.set(id, cloneCompanionEvidence({ ...item, id }))
  }

  return byId
}

function verifyCompanionEvidence(
  policy: UseCaseDeploymentPolicy,
  options: VerifyDeploymentPolicyOptions,
): CompanionEvidenceVerification {
  const requirements = Object.freeze([...(policy.companionEvidence ?? [])])
  const errors: string[] = []
  const byId = companionEvidenceById(options.companionEvidence, errors)
  const missingIds: string[] = []
  const now = options.now ?? nowSeconds()

  for (const requirement of requirements) {
    const evidence = byId.get(requirement.id)
    if (evidence === undefined) {
      if (requirement.required !== false) {
        missingIds.push(requirement.id)
        errors.push(`companion evidence "${requirement.id}" is missing`)
      }
      continue
    }

    if (evidence.status !== 'pass') {
      errors.push(`companion evidence "${requirement.id}" did not pass`)
    }
    if (requirement.expectedSubject !== undefined && evidence.subject !== requirement.expectedSubject) {
      errors.push(`companion evidence "${requirement.id}" subject does not match expected subject`)
    }
    if ((requirement.maxAgeSeconds ?? 0) > 0) {
      if (evidence.checkedAt === undefined) {
        errors.push(`companion evidence "${requirement.id}" missing checkedAt for freshness check`)
      } else if (!Number.isSafeInteger(evidence.checkedAt) || evidence.checkedAt < 0) {
        errors.push(`companion evidence "${requirement.id}" checkedAt is invalid`)
      } else if (evidence.checkedAt > now) {
        errors.push(`companion evidence "${requirement.id}" checkedAt is in the future`)
      } else if (evidence.checkedAt < now - (requirement.maxAgeSeconds ?? 0)) {
        errors.push(`companion evidence "${requirement.id}" is outside the accepted freshness window`)
      }
    }
  }

  return Object.freeze({
    evidence: Object.freeze([...byId.values()]),
    errors,
    missingIds: Object.freeze(missingIds),
    requirements,
    valid: errors.length === 0,
  })
}

function metricTags(event: EventTemplate): Map<string, string> {
  const metrics = new Map<string, string>()
  for (const tag of event.tags) {
    const name = tag[0]
    if (META_TAGS.has(name) || name.startsWith('veil-')) continue
    if (tag[1] !== undefined) metrics.set(name, tag[1])
  }
  return metrics
}

function collectMetric(
  metrics: Record<string, number[]>,
  name: string,
  value: number,
): void {
  metrics[name] ??= []
  metrics[name].push(value)
}

function verifyMetricPolicies(
  events: EventTemplate[],
  policy: UseCaseDeploymentPolicy,
): { errors: string[]; metrics: Record<string, number[]> } {
  const errors: string[] = []
  const metrics: Record<string, number[]> = {}
  const allowedMetricNames = new Set(Object.keys(policy.metricPolicies))

  for (const [index, event] of events.entries()) {
    const published = metricTags(event)

    if (policy.rejectUnknownMetrics) {
      for (const name of published.keys()) {
        if (!allowedMetricNames.has(name)) {
          errors.push(`event[${index}] metric "${name}" is not allowed by deployment policy`)
        }
      }
    }

    for (const [name, metricPolicy] of Object.entries(policy.metricPolicies)) {
      const raw = published.get(name)
      if (raw === undefined) {
        if (metricPolicy.required === true) {
          errors.push(`event[${index}] missing required metric "${name}"`)
        }
        continue
      }

      const value = Number(raw)
      if (!Number.isFinite(value)) {
        errors.push(`event[${index}] metric "${name}" is not a finite number`)
        continue
      }
      if (metricPolicy.integer === true && !Number.isInteger(value)) {
        errors.push(`event[${index}] metric "${name}" must be an integer`)
      }
      if (metricPolicy.min !== undefined && value < metricPolicy.min) {
        errors.push(`event[${index}] metric "${name}" is below deployment minimum ${metricPolicy.min}`)
      }
      if (metricPolicy.max !== undefined && value > metricPolicy.max) {
        errors.push(`event[${index}] metric "${name}" is above deployment maximum ${metricPolicy.max}`)
      }
      collectMetric(metrics, name, value)
    }
  }

  return { errors, metrics }
}

function isSignedEvent(event: EventTemplate): event is SignedEvent {
  const candidate = event as Partial<SignedEvent>
  return typeof candidate.id === 'string'
    && typeof candidate.pubkey === 'string'
    && typeof candidate.sig === 'string'
    && typeof candidate.created_at === 'number'
}

function verifyNostrSignatures(events: EventTemplate[], policy: UseCaseDeploymentPolicy): {
  checked: boolean
  errors: string[]
  valid: boolean
} {
  if (!policy.requireNostrSignature) {
    return { checked: false, errors: [], valid: true }
  }

  const errors: string[] = []
  for (const [index, event] of events.entries()) {
    if (!isSignedEvent(event)) {
      errors.push(`event[${index}] is not a fully signed Nostr event`)
      continue
    }
    if (!verifySignedEvent(event)) {
      errors.push(`event[${index}] Nostr event signature is invalid`)
    }
  }

  return { checked: true, errors, valid: errors.length === 0 }
}

export function verifyDeploymentPolicy(
  events: EventTemplate | readonly EventTemplate[],
  policy: UseCaseDeploymentPolicy,
  options: VerifyDeploymentPolicyOptions = {},
): DeploymentPolicyVerification {
  const eventList = normaliseEvents(events)
  const circleResolution = resolvedAcceptedCircleIds(
    policy.profile,
    policy.acceptedCircleIds,
    policy.circleManifests ?? [],
    policy.allowSupersededCircleIds ?? false,
    options.now,
  )
  const profileVerification = verifyUseCaseProfile(eventList, policy.profile, {
    acceptedCircleIds: circleResolution.acceptedCircleIds,
    aggregateFn: options.aggregateFn,
    expectedSubject: policy.expectedSubject,
    expectedSubjectTagValue: policy.expectedSubjectTagValue,
    maxAgeSeconds: policy.maxAgeSeconds,
    minDistinctSigners: policy.minDistinctSigners,
    now: options.now,
  })
  const metricVerification = verifyMetricPolicies(eventList, policy)
  const companionEvidence = verifyCompanionEvidence(policy, options)
  const nostrSignatures = verifyNostrSignatures(eventList, policy)
  const errors = [
    ...circleResolution.errors,
    ...profileVerification.errors,
    ...metricVerification.errors,
    ...companionEvidence.errors,
    ...nostrSignatures.errors,
  ]
  const valid = errors.length === 0

  return {
    companionEvidence,
    decision: valid ? 'accept' : 'reject',
    errors,
    issues: issuesFromErrors(errors),
    metrics: metricVerification.metrics,
    nostrSignatures: {
      checked: nostrSignatures.checked,
      valid: nostrSignatures.valid,
    },
    policy,
    profileVerification,
    revokedCircleIds: circleResolution.revokedCircleIds,
    supersededCircleIds: circleResolution.supersededCircleIds,
    valid,
  }
}
