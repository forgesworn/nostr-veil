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

export interface CreateDeploymentPolicyOptions {
  acceptedCircleIds?: readonly string[]
  allowSupersededCircleIds?: boolean
  circleManifests?: readonly CircleManifest[]
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
  now?: number
}

export interface DeploymentPolicyVerification {
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

  return Object.freeze({
    acceptedCircleIds: rawCircleIds,
    allowSupersededCircleIds,
    circleManifests,
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
  const nostrSignatures = verifyNostrSignatures(eventList, policy)
  const errors = [
    ...circleResolution.errors,
    ...profileVerification.errors,
    ...metricVerification.errors,
    ...nostrSignatures.errors,
  ]
  const valid = errors.length === 0

  return {
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
