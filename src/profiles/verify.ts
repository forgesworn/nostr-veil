import { validateAssertionStrict } from '../nip85/validators.js'
import { computeCircleId } from '../proof/circle.js'
import { verifyFederation } from '../proof/federate.js'
import { verifyProof } from '../proof/verify.js'
import { isUnixSecondsTagValue } from '../nip85/tags.js'
import { subjectMatchesAnyFormat } from './canonical.js'
import { issuesFromErrors } from './issues.js'
import type { EventTemplate } from '../nip85/types.js'
import type { ContributionBound, ContributionBounds } from '../proof/types.js'
import type {
  UseCaseProfile,
  UseCaseProfileVerification,
  VerifiedProfileEvent,
  VerifyUseCaseProfileOptions,
} from './types.js'

/**
 * How far ahead of the verifier's clock an assertion may be dated, in seconds,
 * when the caller sets no `maxFutureSeconds`. Enough for ordinary clock drift,
 * and short beside the 300-second window the built-in profiles use.
 */
export const DEFAULT_MAX_FUTURE_SECONDS = 60

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * The allowance for a `created_at` ahead of `now`. A value that is not a
 * non-negative integer is an error and allows nothing: compared as it stands,
 * a string or NaN would make the test false and take the bound away. Null is
 * read as unset, which is how a missing field can come back from JSON.
 */
function maxFutureSecondsFrom(options: VerifyUseCaseProfileOptions, errors: string[]): number {
  const value: unknown = options.maxFutureSeconds
  if (value === undefined || value === null) return DEFAULT_MAX_FUTURE_SECONDS
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push('maxFutureSeconds must be a non-negative integer')
    return 0
  }
  return value
}

function tagValues(event: EventTemplate, name: string): string[] {
  return event.tags
    .filter(tag => tag[0] === name)
    .map(tag => tag[1])
    .filter((value): value is string => typeof value === 'string')
}

function singletonTagValue(event: EventTemplate, name: string, errors: string[], prefix: string): string | null {
  const values = tagValues(event, name)
  if (values.length === 0) {
    errors.push(`${prefix} missing ${name} tag`)
    return null
  }
  if (values.length > 1) {
    errors.push(`${prefix} duplicate ${name} tag`)
    return null
  }
  return values[0]
}

function circleId(event: EventTemplate, errors: string[], prefix: string): string | null {
  const ring = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (ring === undefined) {
    errors.push(`${prefix} missing veil-ring tag`)
    return null
  }
  return computeCircleId(ring)
}

function acceptedCircleSet(options: VerifyUseCaseProfileOptions): Set<string> | undefined {
  return options.acceptedCircleIds === undefined
    ? undefined
    : new Set(options.acceptedCircleIds)
}

/**
 * The per-contribution bounds to enforce: each metric's bound from the
 * profile, with any bound the caller supplies for a metric taking its place.
 * Left unvalidated here; `verifyProof` checks the shape and fails closed.
 */
function contributionBoundsFor(
  profile: UseCaseProfile,
  options: VerifyUseCaseProfileOptions,
): ContributionBounds | undefined {
  // No prototype, so a metric named like an Object.prototype member cannot be read from it
  const bounds = Object.create(null) as Record<string, ContributionBound>
  for (const metric of profile.metrics) {
    if (metric.contribution !== undefined) bounds[metric.name] = metric.contribution
  }
  const supplied: unknown = options.contributionBounds
  if (supplied !== undefined) {
    // A malformed value is passed through whole so verifyProof reports it
    if (typeof supplied !== 'object' || supplied === null || Array.isArray(supplied)) {
      return supplied as ContributionBounds
    }
    Object.assign(bounds, supplied)
  }
  return Object.keys(bounds).length === 0 ? undefined : bounds
}

function verifyEvent(
  profile: UseCaseProfile,
  event: EventTemplate,
  index: number,
  options: VerifyUseCaseProfileOptions,
  acceptedCircles: Set<string> | undefined,
  maxFutureSeconds: number,
  errors: string[],
): VerifiedProfileEvent {
  const prefix = `event[${index}]`
  const syntax = validateAssertionStrict(event)
  if (!syntax.valid) {
    errors.push(...syntax.errors.map(error => `${prefix} syntax: ${error}`))
  }

  if (event.kind !== profile.kind) {
    errors.push(`${prefix} kind ${event.kind} does not match profile kind ${profile.kind}`)
  }

  const subject = singletonTagValue(event, 'd', errors, prefix)
  if (subject !== null && !subjectMatchesAnyFormat(subject, profile.subjectFormats)) {
    errors.push(`${prefix} subject does not match profile formats: ${profile.subjectFormats.join(', ')}`)
  }
  if (options.expectedSubject !== undefined && subject !== options.expectedSubject) {
    errors.push(`${prefix} subject does not match expected subject`)
  }

  const subjectTagValue = singletonTagValue(event, profile.subjectTag, errors, prefix)
  const expectedSubjectTagValue = options.expectedSubjectTagValue
    ?? profile.subjectTagValue
    ?? subject
  if (expectedSubjectTagValue !== null && subjectTagValue !== expectedSubjectTagValue) {
    errors.push(`${prefix} ${profile.subjectTag} tag does not match expected subject hint`)
  }

  const requireAggregate = options.aggregate ?? profile.aggregate
  const contributionBounds = contributionBoundsFor(profile, options)
  const proof = verifyProof(event, {
    aggregateFn: options.aggregateFn,
    requireProofVersion: profile.proofVersion,
    ...(requireAggregate === undefined ? {} : { requireAggregate }),
    ...(contributionBounds === undefined ? {} : { contributionBounds }),
  })
  if (!proof.valid) {
    errors.push(...proof.errors.map(error => `${prefix} proof: ${error}`))
  }

  const minDistinctSigners = options.minDistinctSigners ?? profile.minDistinctSigners
  if (profile.federation === undefined && proof.distinctSigners < minDistinctSigners) {
    errors.push(`${prefix} has fewer than ${minDistinctSigners} distinct signers`)
  }

  const maxAgeSeconds = options.maxAgeSeconds ?? profile.maxAgeSeconds
  if (maxAgeSeconds > 0) {
    const now = options.now ?? nowSeconds()
    if (event.created_at === undefined) {
      errors.push(`${prefix} missing created_at for freshness check`)
    } else if (event.created_at < now - maxAgeSeconds) {
      errors.push(`${prefix} assertion is outside the accepted freshness window`)
    } else if (event.created_at > now + maxFutureSeconds) {
      // Only the signer sets created_at, and an event dated ahead stays inside
      // the window until that date plus the window. Without this bound the
      // publisher chooses how long an assertion counts as fresh.
      errors.push(`${prefix} assertion created_at is in the future`)
    }
  }

  // NIP-40: the publisher declared the assertion dead from this time. Many
  // relays and caches still serve expired events, so check it here too.
  const expiration = event.tags.find(tag => tag[0] === 'expiration')?.[1]
  if (expiration !== undefined && isUnixSecondsTagValue(expiration)
    && Number(expiration) <= (options.now ?? nowSeconds())) {
    errors.push(`${prefix} assertion has expired (NIP-40 expiration ${expiration})`)
  }

  const eventCircleId = circleId(event, errors, prefix)
  if (acceptedCircles === undefined || acceptedCircles.size === 0) {
    if (options.requireKnownCircle !== false) {
      errors.push(`${prefix} no accepted circle IDs were supplied`)
    }
  } else if (eventCircleId !== null && !acceptedCircles.has(eventCircleId)) {
    errors.push(`${prefix} circle is not accepted by deployment policy`)
  }

  return {
    circleId: eventCircleId,
    event,
    proof,
    subject,
    syntax,
  }
}

function normaliseEvents(events: EventTemplate | readonly EventTemplate[]): EventTemplate[] {
  if (Array.isArray(events)) return [...events]
  return [events as EventTemplate]
}

export function verifyUseCaseProfile(
  events: EventTemplate | readonly EventTemplate[],
  profile: UseCaseProfile,
  options: VerifyUseCaseProfileOptions = {},
): UseCaseProfileVerification {
  const eventList = normaliseEvents(events)
  const errors: string[] = []
  const acceptedCircles = acceptedCircleSet(options)

  if (eventList.length === 0) {
    errors.push('profile verification requires at least one event')
  }

  if (profile.federation === undefined && eventList.length !== 1) {
    errors.push('profile expects exactly one assertion event')
  }
  if (profile.federation !== undefined) {
    if (eventList.length < profile.federation.minCircles) {
      errors.push(`profile federation requires at least ${profile.federation.minCircles} circles`)
    }
    if (profile.federation.requireScope) {
      for (let i = 0; i < eventList.length; i++) {
        if (tagValues(eventList[i], 'veil-scope').length !== 1) {
          errors.push(`event[${i}] federation profile requires exactly one veil-scope tag`)
        }
      }
    }
  }

  const maxFutureSeconds = maxFutureSecondsFrom(options, errors)
  const verifiedEvents = eventList.map((event, index) =>
    verifyEvent(profile, event, index, options, acceptedCircles, maxFutureSeconds, errors),
  )

  const federation = profile.federation === undefined
    ? undefined
    : verifyFederation(eventList, options.aggregateFn)
  if (federation !== undefined) {
    if (!federation.valid) {
      errors.push(...federation.errors.map(error => `federation: ${error}`))
    }
    const minDistinctSigners = options.minDistinctSigners ?? profile.minDistinctSigners
    if (federation.distinctSigners < minDistinctSigners) {
      errors.push(`federation has fewer than ${minDistinctSigners} distinct signers`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    issues: issuesFromErrors(errors),
    events: verifiedEvents,
    federation,
    profile,
  }
}
