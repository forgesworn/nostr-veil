import { verifySignedEvent } from '../signing.js'
import { readableEvent } from '../nip85/shape.js'
import { issuesFromErrors } from './issues.js'
import { resolveCircleManifests } from './manifest.js'
import { verifyUseCaseProfile } from './verify.js'
import { PUBLISHER_TAGS } from '../nip85/tags.js'
import { isAggregateTagValue } from '../proof/aggregate.js'
import { contributionBoundsProblem } from '../proof/bounds.js'
import type { EventTemplate } from '../nip85/types.js'
import type { AggregateFn, AggregateTagValue, ContributionBound, ContributionBounds } from '../proof/types.js'
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
  /**
   * Accept assertion events only from these publisher keys: the pubkeys that
   * sign the outer Nostr event, as 64-character lowercase hex. Naming them
   * turns `requireNostrSignature` on, because an unsigned event has no
   * publisher.
   *
   * A proof's ring signatures are public and carry no time. Without this list
   * anyone can republish a favourable subset of them, or an old proof under a
   * new `created_at`, with their own key. The list stops a third party doing
   * that. It does not stop a named publisher leaving signatures out, or a
   * relay serving that publisher's earlier event.
   *
   * Not the same as `trustedPublishers`, which names who may sign a
   * deployment bundle.
   */
  acceptedPublishers?: readonly string[]
  /**
   * Require this aggregate function in place of the one the profile pins. Use
   * it when the deployment publishes with `mean`, say, under a built-in profile
   * that pins `median`. Set `contributionBounds` as well for anything but
   * `median`.
   */
  aggregate?: AggregateTagValue
  allowSupersededCircleIds?: boolean
  circleManifests?: readonly CircleManifest[]
  companionEvidence?: readonly CompanionEvidenceRequirement[]
  /**
   * Bounds on each contribution, by metric name. An entry replaces the
   * profile's bound for that metric. `metricPolicies` bound the published
   * aggregate; these bound what one member may sign.
   */
  contributionBounds?: ContributionBounds
  expectedSubject: string
  expectedSubjectTagValue?: string
  id?: string
  maxAgeSeconds?: number
  metricPolicies?: Readonly<Record<string, DeploymentMetricPolicy>>
  minDistinctSigners?: number
  /**
   * Reference timestamp for manifest freshness checks. Defaults to the
   * current time (fail closed); pass an explicit value for tests or
   * historical verification.
   */
  now?: number
  rejectUnknownMetrics?: boolean
  requireNostrSignature?: boolean
}

export interface UseCaseDeploymentPolicy {
  acceptedCircleIds: readonly string[]
  /** Present only when the deployment names the keys that may publish its assertions. */
  acceptedPublishers?: readonly string[]
  /** Present only when the deployment overrides the aggregate the profile pins. */
  aggregate?: AggregateTagValue
  allowSupersededCircleIds: boolean
  circleManifests: readonly CircleManifest[]
  companionEvidence?: readonly CompanionEvidenceRequirement[]
  /** Present only when the deployment sets its own per-contribution bounds. */
  contributionBounds?: ContributionBounds
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
  /**
   * `checked` is true when the policy names its accepted publishers. `valid`
   * is then true only if every event carries a sound Nostr signature from one
   * of them.
   */
  publishers: {
    checked: boolean
    valid: boolean
  }
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

function checkedAggregate(aggregate: AggregateTagValue | undefined): AggregateTagValue | undefined {
  if (aggregate !== undefined && !isAggregateTagValue(aggregate)) {
    throw new Error('aggregate must be one of median, mean, sum, min, max or custom')
  }
  return aggregate
}

function cloneContributionBounds(bounds: ContributionBounds | undefined): ContributionBounds | undefined {
  if (bounds === undefined) return undefined
  const problem = contributionBoundsProblem(bounds)
  if (problem !== undefined) throw new Error(problem)

  const cloned: Record<string, ContributionBound> = {}
  for (const [name, bound] of Object.entries(bounds)) {
    cloned[name] = Object.freeze({ ...bound })
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

/**
 * Problems with a list of accepted publisher keys. Used when a policy is
 * created and again when one is verified, because a policy inside a signed
 * bundle arrives as JSON and nothing has checked its shape.
 */
function acceptedPublisherProblems(publishers: unknown): string[] {
  if (!Array.isArray(publishers) || publishers.length === 0) {
    return ['acceptedPublishers must be a list of at least one publisher key']
  }

  const problems: string[] = []
  // By index: forEach would skip the holes of a sparse list
  for (let index = 0; index < publishers.length; index++) {
    const publisher: unknown = publishers[index]
    if (typeof publisher !== 'string' || !/^[0-9a-f]{64}$/.test(publisher)) {
      problems.push(`acceptedPublishers[${index}] must be a 64-character lowercase hex string`)
    }
  }
  return problems
}

function checkedAcceptedPublishers(publishers: readonly string[] | undefined): readonly string[] | undefined {
  if (publishers === undefined) return undefined
  const problems = acceptedPublisherProblems(publishers)
  if (problems.length > 0) throw new Error(problems.join('; '))

  const seen = new Set<string>()
  for (const [index, publisher] of publishers.entries()) {
    if (seen.has(publisher)) throw new Error(`acceptedPublishers[${index}] is duplicated`)
    seen.add(publisher)
  }
  return Object.freeze([...publishers])
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
    options.now,
  )
  if (circleResolution.errors.length > 0) {
    throw new Error(circleResolution.errors.join('; '))
  }
  if (circleResolution.acceptedCircleIds.length === 0) {
    throw new Error('acceptedCircleIds or circleManifests must supply at least one active circle')
  }
  const companionEvidence = cloneCompanionEvidenceRequirements(options.companionEvidence)
  const aggregate = checkedAggregate(options.aggregate)
  const contributionBounds = cloneContributionBounds(options.contributionBounds)
  const acceptedPublishers = checkedAcceptedPublishers(options.acceptedPublishers)
  if (acceptedPublishers !== undefined && options.requireNostrSignature === false) {
    throw new Error('requireNostrSignature cannot be false when acceptedPublishers is set: an unsigned event has no publisher')
  }

  return Object.freeze({
    acceptedCircleIds: rawCircleIds,
    ...(acceptedPublishers === undefined ? {} : { acceptedPublishers }),
    ...(aggregate === undefined ? {} : { aggregate }),
    allowSupersededCircleIds,
    circleManifests,
    ...(companionEvidence.length === 0 ? {} : { companionEvidence }),
    ...(contributionBounds === undefined ? {} : { contributionBounds }),
    expectedSubject: options.expectedSubject,
    ...(options.expectedSubjectTagValue === undefined ? {} : { expectedSubjectTagValue: options.expectedSubjectTagValue }),
    id: options.id ?? profile.id,
    maxAgeSeconds,
    metricPolicies: cloneMetricPolicies(options.metricPolicies),
    minDistinctSigners,
    profile,
    rejectUnknownMetrics: options.rejectUnknownMetrics ?? false,
    requireNostrSignature: acceptedPublishers !== undefined || (options.requireNostrSignature ?? false),
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
  // Only the well-formed tags: a tag from a relay need not be a list, nor its
  // name a string, and the profile verifier has reported any that are not
  for (const tag of readableEvent(event).tags) {
    const name = tag[0]
    if (META_TAGS.has(name) || PUBLISHER_TAGS.has(name) || name.startsWith('veil-')) continue
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
  const candidate = event as Partial<SignedEvent> | null
  // What a relay returns need not be an object at all
  return candidate !== null
    && typeof candidate === 'object'
    && typeof candidate.id === 'string'
    && typeof candidate.pubkey === 'string'
    && typeof candidate.sig === 'string'
    && typeof candidate.created_at === 'number'
}

/**
 * Check each event's Nostr signature and, where the policy names its
 * publishers, that one of them signed it.
 *
 * Naming publishers forces the signature check whatever
 * `requireNostrSignature` says: the `pubkey` field of an unsigned event is a
 * claim anyone can make. `verifySignedEvent` recomputes the event id from the
 * event body, so a named publisher's id and signature cannot be moved onto
 * other tags.
 */
function verifyPublishers(events: EventTemplate[], policy: UseCaseDeploymentPolicy): {
  errors: string[]
  nostrSignatures: { checked: boolean; valid: boolean }
  publishers: { checked: boolean; valid: boolean }
} {
  const listed: unknown = policy.acceptedPublishers
  const named = listed !== undefined
  if (!named && !policy.requireNostrSignature) {
    return {
      errors: [],
      nostrSignatures: { checked: false, valid: true },
      publishers: { checked: false, valid: true },
    }
  }

  // A malformed list accepts nobody. It never falls back to accepting anyone.
  const listProblems = named ? acceptedPublisherProblems(listed) : []
  const accepted = named && listProblems.length === 0 ? new Set(listed as string[]) : undefined
  const errors = [...listProblems]
  let signaturesValid = true
  let publishersAccepted = listProblems.length === 0

  for (const [index, event] of events.entries()) {
    if (!isSignedEvent(event)) {
      errors.push(`event[${index}] is not a fully signed Nostr event`)
      signaturesValid = false
      continue
    }
    if (!verifySignedEvent(event)) {
      errors.push(`event[${index}] Nostr event signature is invalid`)
      signaturesValid = false
      continue
    }
    if (accepted !== undefined && !accepted.has(event.pubkey)) {
      errors.push(`event[${index}] publisher is not accepted by deployment policy`)
      publishersAccepted = false
    }
  }

  return {
    errors,
    nostrSignatures: { checked: true, valid: signaturesValid },
    publishers: { checked: named, valid: !named || (signaturesValid && publishersAccepted) },
  }
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
    ...(policy.aggregate === undefined ? {} : { aggregate: policy.aggregate }),
    aggregateFn: options.aggregateFn,
    ...(policy.contributionBounds === undefined ? {} : { contributionBounds: policy.contributionBounds }),
    expectedSubject: policy.expectedSubject,
    expectedSubjectTagValue: policy.expectedSubjectTagValue,
    maxAgeSeconds: policy.maxAgeSeconds,
    minDistinctSigners: policy.minDistinctSigners,
    now: options.now,
  })
  const metricVerification = verifyMetricPolicies(eventList, policy)
  const companionEvidence = verifyCompanionEvidence(policy, options)
  const publisherVerification = verifyPublishers(eventList, policy)
  const errors = [
    ...circleResolution.errors,
    ...profileVerification.errors,
    ...metricVerification.errors,
    ...companionEvidence.errors,
    ...publisherVerification.errors,
  ]
  const valid = errors.length === 0

  return {
    companionEvidence,
    decision: valid ? 'accept' : 'reject',
    errors,
    issues: issuesFromErrors(errors),
    metrics: metricVerification.metrics,
    nostrSignatures: publisherVerification.nostrSignatures,
    policy,
    profileVerification,
    publishers: publisherVerification.publishers,
    revokedCircleIds: circleResolution.revokedCircleIds,
    supersededCircleIds: circleResolution.supersededCircleIds,
    valid,
  }
}
