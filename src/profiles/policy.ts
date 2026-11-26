import { verifySignedEvent } from '../signing.js'
import { readableEvent } from '../nip85/shape.js'
import { CodedErrors, issuesOf } from './coded.js'
import { deploymentFieldIssues } from './fields.js'
import { resolveCircleManifests } from './manifest.js'
import { NOW_INVALID, verificationTime, withoutRepeatedTimeIssue } from './time.js'
import { verifyUseCaseProfile } from './verify.js'
import { PUBLISHER_TAGS } from '../nip85/tags.js'
import { isAggregateTagValue } from '../proof/aggregate.js'
import { contributionBoundsProblem } from '../proof/bounds.js'
import type { EventTemplate } from '../nip85/types.js'
import type { AggregateFn, AggregateTagValue, ContributionBound, ContributionBounds } from '../proof/types.js'
import type { SignedEvent } from '../signing.js'
import type { VerificationIssue, VerificationIssueCode } from './issues.js'
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
  /**
   * How far ahead of the verifier's clock an assertion's `created_at` may be,
   * in seconds, before it is rejected. Only the signer sets `created_at`, and
   * an event dated ahead stays inside the freshness window until that date
   * plus the window. Zero allows no skew. It is the upper end of the freshness
   * window, so setting it while `maxAgeSeconds` is 0 throws. Default:
   * `DEFAULT_MAX_FUTURE_SECONDS`.
   */
  maxFutureSeconds?: number
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
  /** Present only when the deployment sets its own allowance for a `created_at` ahead of the verifier's clock. */
  maxFutureSeconds?: number
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

/**
 * Problems with the bounds of one metric policy. Used when a policy is created
 * and again when one is verified, because a policy inside a signed bundle
 * arrives as JSON and nothing has checked its shape. `value < min` is false
 * for a word, an object or null, so a malformed bound compared as it stands
 * would let any value through the gate it was written for.
 */
function metricPolicyProblems(name: string, policy: DeploymentMetricPolicy): string[] {
  const problems: string[] = []
  const min: unknown = policy.min
  const max: unknown = policy.max
  const minFinite = typeof min === 'number' && Number.isFinite(min)
  const maxFinite = typeof max === 'number' && Number.isFinite(max)
  if (min !== undefined && !minFinite) problems.push(`metricPolicies.${name}.min must be a finite number`)
  if (max !== undefined && !maxFinite) problems.push(`metricPolicies.${name}.max must be a finite number`)
  if (minFinite && maxFinite && (min as number) > (max as number)) {
    problems.push(`metricPolicies.${name}.min must be <= max`)
  }
  return problems
}

function assertMetricPolicy(name: string, policy: DeploymentMetricPolicy): void {
  const problems = metricPolicyProblems(name, policy)
  if (problems.length > 0) throw new Error(problems[0])
}

function cloneMetricPolicies(
  policies: Readonly<Record<string, DeploymentMetricPolicy>> | undefined,
): Readonly<Record<string, DeploymentMetricPolicy>> {
  const entries = Object.entries(policies ?? {})
  const cloned: Record<string, DeploymentMetricPolicy> = {}

  for (const [name, policy] of entries) {
    if (name.trim() === '') throw new Error('metric policy name must be non-empty')
    // A null entry or flag is read as unset and not stored: the verifier
    // rejects a null in a policy read from JSON
    if (policy === null) continue
    assertMetricPolicy(name, policy)
    cloned[name] = Object.freeze(Object.fromEntries(Object.entries(policy).filter(([, value]) => value !== null)))
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
  const given: unknown = requirement.id
  const id = typeof given === 'string' ? given.trim() : ''
  if (id === '') throw new Error(`companionEvidence[${index}].id must be non-empty`)
  assertNonNegativeInteger(requirement.maxAgeSeconds ?? 0, `companionEvidence[${index}].maxAgeSeconds`)
  // A null label or subject is read as unset, as a null window is below
  const label = requirement.label ?? undefined
  const expectedSubject = requirement.expectedSubject ?? undefined
  if (expectedSubject !== undefined && expectedSubject.trim() === '') {
    throw new Error(`companionEvidence[${index}].expectedSubject must be non-empty`)
  }
  if (label !== undefined && label.trim() === '') {
    throw new Error(`companionEvidence[${index}].label must be non-empty`)
  }

  // The check above reads a null window as none, and so does this: a null is
  // not stored, because the verifier rejects one in a policy read from JSON.
  const window: unknown = requirement.maxAgeSeconds
  return Object.freeze({
    id,
    ...(label === undefined ? {} : { label }),
    ...(expectedSubject === undefined ? {} : { expectedSubject }),
    ...(window === undefined || window === null ? {} : { maxAgeSeconds: requirement.maxAgeSeconds }),
    required: requirement.required ?? true,
  })
}

function cloneCompanionEvidenceRequirements(
  requirements: readonly CompanionEvidenceRequirement[] | undefined,
): readonly CompanionEvidenceRequirement[] {
  const cloned: CompanionEvidenceRequirement[] = []
  const seen = new Set<string>()

  for (const [index, requirement] of (requirements ?? []).entries()) {
    // A null entry is read as unset, as a null option is
    if (requirement === null || requirement === undefined) continue
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
function acceptedPublisherProblems(publishers: unknown): Array<{ message: string; path?: string }> {
  if (!Array.isArray(publishers) || publishers.length === 0) {
    return [{ message: 'acceptedPublishers must be a list of at least one publisher key' }]
  }

  const problems: Array<{ message: string; path?: string }> = []
  // By index: forEach would skip the holes of a sparse list
  for (let index = 0; index < publishers.length; index++) {
    const publisher: unknown = publishers[index]
    if (typeof publisher !== 'string' || !/^[0-9a-f]{64}$/.test(publisher)) {
      const path = `acceptedPublishers[${index}]`
      problems.push({ message: `${path} must be a 64-character lowercase hex string`, path })
    }
  }
  return problems
}

function checkedAcceptedPublishers(publishers: readonly string[] | undefined): readonly string[] | undefined {
  if (publishers === undefined) return undefined
  const problems = acceptedPublisherProblems(publishers)
  if (problems.length > 0) throw new Error(problems.map(problem => problem.message).join('; '))

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
  issues: readonly VerificationIssue[]
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
    issues: issuesOf(manifestResolution),
    revokedCircleIds: manifestResolution.revokedCircleIds,
    supersededCircleIds: manifestResolution.supersededCircleIds,
  }
}

export function createDeploymentPolicy(
  profile: UseCaseProfile,
  options: CreateDeploymentPolicyOptions,
): UseCaseDeploymentPolicy {
  // A null is read as unset, and the subject is not optional
  const expectedSubject: unknown = options.expectedSubject
  if (typeof expectedSubject !== 'string' || expectedSubject.trim() === '') {
    throw new Error('expectedSubject must be non-empty')
  }

  const maxAgeSeconds = options.maxAgeSeconds ?? profile.maxAgeSeconds
  const minDistinctSigners = options.minDistinctSigners ?? profile.minDistinctSigners
  assertNonNegativeInteger(maxAgeSeconds, 'maxAgeSeconds')
  if (options.maxFutureSeconds !== undefined) {
    assertNonNegativeInteger(options.maxFutureSeconds, 'maxFutureSeconds')
    // The allowance is the upper end of the freshness window. With the window
    // off no date is checked, so the value would be stored and never used.
    if (maxAgeSeconds === 0) {
      throw new Error('maxFutureSeconds is set while maxAgeSeconds turns the freshness window off')
    }
  }
  assertPositiveInteger(minDistinctSigners, 'minDistinctSigners')
  const rawCircleIds = optionalAcceptedCircleIds(options.acceptedCircleIds ?? undefined)
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

  const policy: UseCaseDeploymentPolicy = Object.freeze({
    acceptedCircleIds: rawCircleIds,
    ...(acceptedPublishers === undefined ? {} : { acceptedPublishers }),
    ...(aggregate === undefined ? {} : { aggregate }),
    allowSupersededCircleIds,
    circleManifests,
    ...(companionEvidence.length === 0 ? {} : { companionEvidence }),
    ...(contributionBounds === undefined ? {} : { contributionBounds }),
    expectedSubject: options.expectedSubject,
    ...(options.expectedSubjectTagValue == null ? {} : { expectedSubjectTagValue: options.expectedSubjectTagValue }),
    id: options.id ?? profile.id,
    maxAgeSeconds,
    ...(options.maxFutureSeconds === undefined ? {} : { maxFutureSeconds: options.maxFutureSeconds }),
    metricPolicies: cloneMetricPolicies(options.metricPolicies),
    minDistinctSigners,
    profile,
    rejectUnknownMetrics: options.rejectUnknownMetrics ?? false,
    requireNostrSignature: acceptedPublishers !== undefined || (options.requireNostrSignature ?? false),
  })
  // The verifier checks the shape of every policy it reads. A policy it would
  // refuse, for a profile or a manifest of the wrong shape, is not made.
  const problems = deploymentFieldIssues(policy)
  if (problems.length > 0) throw new Error(problems.map(issue => issue.message).join('; '))
  return policy
}

/**
 * The result for a policy with a field of the wrong type. Nothing else in it
 * is read: read as it stood, the field would make the verifier throw or switch
 * its check off. So the run is a rejection with those issues alone, and no
 * event is checked against the policy.
 */
function stoppedOnFields(
  policy: unknown,
  fieldIssues: readonly VerificationIssue[],
  now: unknown,
): DeploymentPolicyVerification {
  // A time that cannot be compared is still reported, as every verifier that
  // takes one reports it
  const issues = verificationTime(now) === undefined
    ? [...fieldIssues, Object.freeze({ code: 'verification.now_invalid' as const, message: NOW_INVALID })]
    : [...fieldIssues]
  const profileIssues = issues.filter(issue => issue.code === 'profile.field_invalid')
  // Handed back as the policy gave it, as for a policy that was not applied
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
    errors: issues.map(issue => issue.message),
    issues: [...issues],
    metrics: {},
    nostrSignatures: { checked: false, valid: false },
    policy: policy as UseCaseDeploymentPolicy,
    profileVerification: {
      valid: false,
      errors: profileIssues.map(issue => issue.message),
      issues: profileIssues,
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
  found: CodedErrors,
): Map<string, CompanionEvidence> {
  const byId = new Map<string, CompanionEvidence>()

  for (const [index, item] of (evidence ?? []).entries()) {
    const id = item.id.trim()
    if (id === '') {
      found.add('companion.invalid', `companion evidence[${index}] id must be non-empty`)
      continue
    }
    if (byId.has(id)) {
      found.add('companion.invalid', `companion evidence "${id}" is duplicated`)
      continue
    }
    if (item.status !== 'pass' && item.status !== 'fail') {
      found.add('companion.invalid', `companion evidence "${id}" status is invalid`)
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
  const found = new CodedErrors()
  const byId = companionEvidenceById(options.companionEvidence, found)
  const missingIds: string[] = []
  // Undefined when the caller's now cannot be compared. Then no evidence is
  // compared against it, and the evidence fails for that instead.
  const now = verificationTime(options.now)
  if (now === undefined) found.add('verification.now_invalid', NOW_INVALID)

  for (const requirement of requirements) {
    // The requirement arrives as JSON inside a bundle. `> 0` is false for a
    // word or a negative number, which would switch this window off unnoticed.
    // It is checked before the evidence is looked up, so that a malformed
    // window is reported whether or not the evidence was supplied.
    const window: unknown = requirement.maxAgeSeconds
    const windowMalformed = window !== undefined
      && (typeof window !== 'number' || !Number.isSafeInteger(window) || window < 0)
    if (windowMalformed) {
      found.add('companion.invalid', `companion evidence "${requirement.id}" maxAgeSeconds must be a non-negative integer`)
    }

    const evidence = byId.get(requirement.id)
    if (evidence === undefined) {
      if (requirement.required !== false) {
        missingIds.push(requirement.id)
        found.add('companion.missing', `companion evidence "${requirement.id}" is missing`)
      }
      continue
    }

    if (evidence.status !== 'pass') {
      found.add('companion.failed', `companion evidence "${requirement.id}" did not pass`)
    }
    if (requirement.expectedSubject !== undefined && evidence.subject !== requirement.expectedSubject) {
      found.add('companion.subject_mismatch', `companion evidence "${requirement.id}" subject does not match expected subject`)
    }
    // Nothing is compared against a malformed window
    if (windowMalformed) continue
    if ((requirement.maxAgeSeconds ?? 0) > 0) {
      if (evidence.checkedAt === undefined) {
        found.add('companion.checked_at_missing', `companion evidence "${requirement.id}" missing checkedAt for freshness check`)
      } else if (!Number.isSafeInteger(evidence.checkedAt) || evidence.checkedAt < 0) {
        found.add('companion.invalid', `companion evidence "${requirement.id}" checkedAt is invalid`)
      } else if (now !== undefined && evidence.checkedAt > now) {
        found.add('companion.checked_at_future', `companion evidence "${requirement.id}" checkedAt is in the future`)
      } else if (now !== undefined && evidence.checkedAt < now - (requirement.maxAgeSeconds ?? 0)) {
        found.add('companion.stale', `companion evidence "${requirement.id}" is outside the accepted freshness window`)
      }
    }
  }

  return Object.freeze({
    evidence: Object.freeze([...byId.values()]),
    errors: found.errors,
    missingIds: Object.freeze(missingIds),
    requirements,
    valid: found.length === 0,
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
  // A metric can be named after a member every object has, such as
  // constructor: only the object's own entry is the metric's, and a new one
  // is defined rather than assigned, so a name never reaches the prototype
  if (!Object.hasOwn(metrics, name)) {
    Object.defineProperty(metrics, name, { configurable: true, enumerable: true, value: [], writable: true })
  }
  metrics[name].push(value)
}

function verifyMetricPolicies(
  events: EventTemplate[],
  policy: UseCaseDeploymentPolicy,
): { issues: VerificationIssue[]; metrics: Record<string, number[]> } {
  const found = new CodedErrors()
  const metrics: Record<string, number[]> = {}
  const allowedMetricNames = new Set(Object.keys(policy.metricPolicies))

  // A malformed bound is reported once, here, and its metric is then left
  // alone: nothing is compared against a bound that is not a number.
  const malformed = new Set<string>()
  for (const [name, metricPolicy] of Object.entries(policy.metricPolicies)) {
    const problems = metricPolicyProblems(name, metricPolicy)
    if (problems.length > 0) {
      for (const problem of problems) found.add('policy.metric_policy_invalid', problem)
      malformed.add(name)
    }
  }

  for (const [index, event] of events.entries()) {
    const published = metricTags(event)
    const place = `event[${index}]`
    // A fault in a metric is filed under the event and that tag. A tag with
    // no name has no place of its own to point at.
    const raise = (code: VerificationIssueCode, name: string, text: string): void => {
      found.add(code, `${place} metric "${name}" ${text}`, name === '' ? place : `${place}.tags.${name}`)
    }

    if (policy.rejectUnknownMetrics) {
      for (const name of published.keys()) {
        if (!allowedMetricNames.has(name)) {
          raise('metric.unknown', name, 'is not allowed by deployment policy')
        }
      }
    }

    for (const [name, metricPolicy] of Object.entries(policy.metricPolicies)) {
      if (malformed.has(name)) continue
      const raw = published.get(name)
      if (raw === undefined) {
        if (metricPolicy.required === true) {
          found.add('metric.required_missing', `${place} missing required metric "${name}"`, place)
        }
        continue
      }

      const value = Number(raw)
      if (!Number.isFinite(value)) {
        raise('metric.invalid_value', name, 'is not a finite number')
        continue
      }
      if (metricPolicy.integer === true && !Number.isInteger(value)) {
        raise('metric.integer_required', name, 'must be an integer')
      }
      if (metricPolicy.min !== undefined && value < metricPolicy.min) {
        raise('metric.below_min', name, `is below deployment minimum ${metricPolicy.min}`)
      }
      if (metricPolicy.max !== undefined && value > metricPolicy.max) {
        raise('metric.above_max', name, `is above deployment maximum ${metricPolicy.max}`)
      }
      collectMetric(metrics, name, value)
    }
  }

  return { issues: found.issues, metrics }
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
  issues: VerificationIssue[]
  nostrSignatures: { checked: boolean; valid: boolean }
  publishers: { checked: boolean; valid: boolean }
} {
  const listed: unknown = policy.acceptedPublishers
  const named = listed !== undefined
  if (!named && !policy.requireNostrSignature) {
    return {
      issues: [],
      nostrSignatures: { checked: false, valid: true },
      publishers: { checked: false, valid: true },
    }
  }

  // A malformed list accepts nobody. It never falls back to accepting anyone.
  const listProblems = named ? acceptedPublisherProblems(listed) : []
  const accepted = named && listProblems.length === 0 ? new Set(listed as string[]) : undefined
  const found = new CodedErrors()
  for (const problem of listProblems) found.add('policy.accepted_publishers_invalid', problem.message, problem.path)
  let signaturesValid = true
  let publishersAccepted = listProblems.length === 0

  for (const [index, event] of events.entries()) {
    const place = `event[${index}]`
    if (!isSignedEvent(event)) {
      found.add('event.signature_missing', `${place} is not a fully signed Nostr event`, place)
      signaturesValid = false
      continue
    }
    if (!verifySignedEvent(event)) {
      found.add('event.signature_invalid', `${place} Nostr event signature is invalid`, place)
      signaturesValid = false
      continue
    }
    if (accepted !== undefined && !accepted.has(event.pubkey)) {
      found.add('event.publisher_unaccepted', `${place} publisher is not accepted by deployment policy`, place)
      publishersAccepted = false
    }
  }

  return {
    issues: found.issues,
    nostrSignatures: { checked: true, valid: signaturesValid },
    publishers: { checked: named, valid: !named || (signaturesValid && publishersAccepted) },
  }
}

export function verifyDeploymentPolicy(
  events: EventTemplate | readonly EventTemplate[],
  policy: UseCaseDeploymentPolicy,
  options: VerifyDeploymentPolicyOptions = {},
): DeploymentPolicyVerification {
  // A policy read from JSON is checked for shape before anything in it is read
  const fieldIssues = deploymentFieldIssues(policy)
  if (fieldIssues.length > 0) return stoppedOnFields(policy, fieldIssues, options.now)

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
    // Passed as it stands: a policy inside a bundle arrives as JSON, and the
    // profile verifier rejects a value that is not a non-negative integer
    ...(policy.maxFutureSeconds === undefined ? {} : { maxFutureSeconds: policy.maxFutureSeconds }),
    minDistinctSigners: policy.minDistinctSigners,
    now: options.now,
  })
  const metricVerification = verifyMetricPolicies(eventList, policy)
  const companionEvidence = verifyCompanionEvidence(policy, options)
  const publisherVerification = verifyPublishers(eventList, policy)
  // The manifests, the profile and the companion evidence read the same now,
  // and each reports one it cannot compare. Each part hands over its issues
  // under the codes they were raised with, and the errors are those issues'
  // own messages, so the two lists cannot fall out of step.
  const issues = withoutRepeatedTimeIssue([
    ...circleResolution.issues,
    ...issuesOf(profileVerification),
    ...metricVerification.issues,
    ...issuesOf(companionEvidence),
    ...publisherVerification.issues,
  ])
  const errors = issues.map(issue => issue.message)
  const valid = errors.length === 0

  return {
    companionEvidence,
    decision: valid ? 'accept' : 'reject',
    errors,
    issues,
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
