import { syntaxErrorKinds } from '../nip85/error-kinds.js'
import { validateAssertionStrict } from '../nip85/validators.js'
import { readableEvent, shown } from '../nip85/shape.js'
import { computeCircleId } from '../proof/circle.js'
import { proofErrorKinds } from '../proof/error-kinds.js'
import { verifyFederation } from '../proof/federate.js'
import { verifyProof } from '../proof/verify.js'
import { isUnixSecondsTagValue } from '../nip85/tags.js'
import { subjectMatchesAnyFormat } from './canonical.js'
import { CodedErrors } from './coded.js'
import { profileFieldProblems } from './fields.js'
import { NOW_INVALID, verificationTime } from './time.js'
import type { EventTemplate } from '../nip85/types.js'
import type { ProofErrorKind } from '../proof/error-kinds.js'
import type { ContributionBound, ContributionBounds } from '../proof/types.js'
import type { VerificationIssueCode } from './issues.js'
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

/**
 * The signer threshold: the caller's option, or else the profile's.
 * `signers < threshold` is false for a word or an object, and nothing is below
 * zero, so a malformed value read as it stands would let a single signer
 * through. It is reported instead, and undefined comes back so that no count
 * is compared against it. The rule is the one `createDeploymentPolicy` and the
 * profile definition apply: a positive integer. Only an absent option is
 * unset, and the profile is checked too, because the one inside a bundle
 * arrives as JSON.
 */
function minDistinctSignersFrom(
  profile: UseCaseProfile,
  options: VerifyUseCaseProfileOptions,
  found: CodedErrors,
): number | undefined {
  const value: unknown = options.minDistinctSigners === undefined
    ? profile.minDistinctSigners
    : options.minDistinctSigners
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    found.add('policy.min_distinct_signers_invalid', 'minDistinctSigners must be a positive integer')
    return undefined
  }
  return value
}

/**
 * The freshness window in seconds: the caller's option, or else the profile's.
 * `maxAgeSeconds > 0` is false for a word, an object or a negative number, so
 * a malformed value read as it stands would switch the window off, and the
 * future bound inside it, without a word. It is reported instead, and
 * undefined comes back so that no date is compared against it. Only an absent
 * option is unset: null is what NaN becomes in JSON. The profile is checked
 * too, because the one inside a bundle arrives as JSON.
 */
function maxAgeSecondsFrom(
  profile: UseCaseProfile,
  options: VerifyUseCaseProfileOptions,
  found: CodedErrors,
): number | undefined {
  const value: unknown = options.maxAgeSeconds === undefined ? profile.maxAgeSeconds : options.maxAgeSeconds
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    found.add('policy.max_age_seconds_invalid', 'maxAgeSeconds must be a non-negative integer')
    return undefined
  }
  return value
}

/**
 * The allowance for a `created_at` ahead of `now`. A value that is not a
 * non-negative integer is an error: compared as it stands, a string or NaN
 * would make the test false and take the bound away. It is reported once for
 * the run and undefined comes back, so that no date is compared against it and
 * no event is called future-dated for a fault in the policy. That includes
 * null, which is what NaN becomes in JSON; only an absent value is unset.
 *
 * The allowance is the upper end of the freshness window. With the window off
 * no date is checked, so a value set beside it would be read and then dropped.
 * That is an error too. A malformed window has already been reported and is
 * not reported again here.
 */
function maxFutureSecondsFrom(
  options: VerifyUseCaseProfileOptions,
  maxAgeSeconds: number | undefined,
  found: CodedErrors,
): number | undefined {
  const value: unknown = options.maxFutureSeconds
  if (value === undefined) return DEFAULT_MAX_FUTURE_SECONDS
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    found.add('policy.max_future_seconds_invalid', 'maxFutureSeconds must be a non-negative integer')
    return undefined
  }
  if (maxAgeSeconds === 0) {
    found.add(
      'policy.max_future_seconds_invalid',
      'maxFutureSeconds is set while maxAgeSeconds turns the freshness window off',
    )
  }
  return value
}

function tagValues(event: EventTemplate, name: string): string[] {
  return event.tags
    .filter(tag => tag[0] === name)
    .map(tag => tag[1])
    .filter((value): value is string => typeof value === 'string')
}

function singletonTagValue(event: EventTemplate, name: string, found: CodedErrors, prefix: string): string | null {
  const values = tagValues(event, name)
  // A tag the event must carry once is a fault of its shape
  if (values.length === 0) {
    found.add('nip85.syntax_invalid', `${prefix} missing ${name} tag`, prefix)
    return null
  }
  if (values.length > 1) {
    found.add('nip85.syntax_invalid', `${prefix} duplicate ${name} tag`, prefix)
    return null
  }
  return values[0]
}

const HEX64 = /^[0-9a-f]{64}$/u

function circleId(given: EventTemplate, event: EventTemplate, found: CodedErrors, prefix: string): string | null {
  const rings = event.tags.filter(tag => tag[0] === 'veil-ring')
  if (rings.length === 0) {
    // No ring, no proof
    found.add('proof.invalid', `${prefix} missing veil-ring tag`, prefix)
    return null
  }
  // A ring names a circle only as one tag of two or more member keys in sorted
  // order, which the proof verifier requires too. The circle id joins the
  // members with ':', so a ring of 'A:B' would name the circle of A and B. A
  // second ring tag counts whether it can be read or not, as the proof
  // verifier sees the event as given. Its tags are a list here, as the event
  // read from it has a ring. A ring larger than the proof verifier allows
  // still names its circle, which a deployment may accept, and the proof
  // check fails it. The proof verifier says what is wrong with any other ring.
  const ringTags = (given.tags as unknown[]).filter(tag => Array.isArray(tag) && tag[0] === 'veil-ring').length
  const ring = rings[0].slice(1)
  const named = ringTags === 1 && ring.length >= 2 && ring.every((member, index) =>
    typeof member === 'string' && HEX64.test(member) && (index === 0 || member > ring[index - 1]))
  return named ? computeCircleId(ring) : null
}

/**
 * The code for one error of a proof. The proof verifier says which of its
 * errors break a requirement the caller set, the aggregate or the bounds on a
 * contribution; every other is a proof that is not sound. Nothing is read
 * from the error's words, which quote the event.
 */
function proofCode(kind: ProofErrorKind | undefined): VerificationIssueCode {
  if (kind === 'aggregate-mismatch') return 'proof.aggregate_mismatch'
  if (kind === 'contribution-out-of-bounds') return 'proof.contribution_out_of_bounds'
  return 'proof.invalid'
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
  given: EventTemplate,
  index: number,
  options: VerifyUseCaseProfileOptions,
  acceptedCircles: Set<string> | undefined,
  minDistinctSigners: number | undefined,
  now: number | undefined,
  maxAgeSeconds: number | undefined,
  maxFutureSeconds: number | undefined,
  found: CodedErrors,
): VerifiedProfileEvent {
  const prefix = `event[${index}]`
  // Every error of this event opens with its place and is filed under it
  const raise = (code: VerificationIssueCode, text: string): void => found.add(code, `${prefix} ${text}`, prefix)
  const syntax = validateAssertionStrict(given)
  if (!syntax.valid) {
    // The validator says which of its errors is a metric value that is not a
    // number. Every other is a syntax failure, whatever it quotes from the tags.
    syntax.errors.forEach((error, position) => {
      const kind = syntaxErrorKinds.of(syntax.errors, position)
      raise(kind === 'metric-not-finite' ? 'metric.invalid_value' : 'nip85.syntax_invalid', `syntax: ${error}`)
    })
  }
  // An event from a relay can be anything. The reads below see only the tags
  // that can be read: on the event as given they would throw where they
  // should turn it away. The syntax check does not read every tag, so the
  // production report fails the profile, circle, proof and metric controls
  // for an event too malformed to read. The proof verifier is still handed
  // the event as given.
  const event = readableEvent(given)

  if (event.kind !== profile.kind) {
    raise('profile.kind_mismatch', `kind ${shown(event.kind)} does not match profile kind ${profile.kind}`)
  }

  const subject = singletonTagValue(event, 'd', found, prefix)
  if (subject !== null && !subjectMatchesAnyFormat(subject, profile.subjectFormats)) {
    raise('profile.subject_format_invalid', `subject does not match profile formats: ${profile.subjectFormats.join(', ')}`)
  }
  if (options.expectedSubject !== undefined && subject !== options.expectedSubject) {
    raise('profile.subject_mismatch', 'subject does not match expected subject')
  }

  const subjectTagValue = singletonTagValue(event, profile.subjectTag, found, prefix)
  const expectedSubjectTagValue = options.expectedSubjectTagValue
    ?? profile.subjectTagValue
    ?? subject
  if (expectedSubjectTagValue !== null && subjectTagValue !== expectedSubjectTagValue) {
    raise('profile.subject_hint_mismatch', `${profile.subjectTag} tag does not match expected subject hint`)
  }

  const requireAggregate = options.aggregate ?? profile.aggregate
  const contributionBounds = contributionBoundsFor(profile, options)
  const proof = verifyProof(given, {
    aggregateFn: options.aggregateFn,
    requireProofVersion: profile.proofVersion,
    ...(requireAggregate === undefined ? {} : { requireAggregate }),
    ...(contributionBounds === undefined ? {} : { contributionBounds }),
  })
  if (!proof.valid) {
    proof.errors.forEach((error, position) => {
      raise(proofCode(proofErrorKinds.of(proof.errors, position)), `proof: ${error}`)
    })
  }

  // Undefined when the threshold is malformed, which is reported once for the run
  if (
    profile.federation === undefined
    && minDistinctSigners !== undefined
    && proof.distinctSigners < minDistinctSigners
  ) {
    raise('proof.threshold_not_met', `has fewer than ${minDistinctSigners} distinct signers`)
  }

  // The window and the allowance are undefined when malformed, and now is
  // undefined when it cannot be compared. Each is reported once for the run,
  // and nothing is compared against any of them.
  if (maxAgeSeconds !== undefined && maxAgeSeconds > 0) {
    const createdAt: unknown = event.created_at
    if (createdAt === undefined) {
      raise('assertion.created_at_missing', 'missing created_at for freshness check')
    } else if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt)) {
      // Compared as it stands, a word or NaN is neither older than the window
      // nor ahead of it, so the assertion would pass both ends and never go
      // stale, and an object or a deeply nested list would be converted first,
      // which can throw. An event that arrives as JSON can carry anything here.
      raise('assertion.created_at_invalid', 'assertion created_at is not a Unix timestamp')
    } else if (now !== undefined && createdAt < now - maxAgeSeconds) {
      raise('assertion.stale', 'assertion is outside the accepted freshness window')
    } else if (now !== undefined && maxFutureSeconds !== undefined && createdAt - maxFutureSeconds > now) {
      // Only the signer sets created_at, and an event dated ahead stays inside
      // the window until that date plus the window. Without this bound the
      // publisher chooses how long an assertion counts as fresh.
      raise('assertion.created_at_future', 'assertion created_at is in the future')
    }
  }

  // NIP-40: the publisher declared the assertion dead from this time. Many
  // relays and caches still serve expired events, so check it here too.
  const expiration = event.tags.find(tag => tag[0] === 'expiration')?.[1]
  if (now !== undefined && expiration !== undefined && isUnixSecondsTagValue(expiration)
    && Number(expiration) <= now) {
    raise('assertion.expired', `assertion has expired (NIP-40 expiration ${expiration})`)
  }

  const eventCircleId = circleId(given, event, found, prefix)
  if (acceptedCircles === undefined || acceptedCircles.size === 0) {
    if (options.requireKnownCircle !== false) {
      raise('circle.accepted_missing', 'no accepted circle IDs were supplied')
    }
  } else if (eventCircleId === null || !acceptedCircles.has(eventCircleId)) {
    // An event with no ring names no circle, so it is from none the policy
    // accepts. Left unchecked, the circle control would read it as passed.
    raise('circle.unaccepted', 'circle is not accepted by deployment policy')
  }

  return {
    circleId: eventCircleId,
    event: given,
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
  // A profile can arrive inside a policy read from JSON. One with a field of
  // the wrong type is reported and nothing else is checked: read as it stood,
  // the field would make this throw or switch its check off.
  const fieldProblems = profileFieldProblems(profile)
  if (fieldProblems.length > 0) {
    const stopped = new CodedErrors()
    for (const problem of fieldProblems) stopped.add('profile.field_invalid', problem.message, problem.path)
    if (verificationTime(options.now) === undefined) stopped.add('verification.now_invalid', NOW_INVALID)
    return { valid: false, errors: stopped.errors, issues: stopped.issues, events: [], federation: undefined, profile }
  }

  const eventList = normaliseEvents(events)
  const found = new CodedErrors()
  const acceptedCircles = acceptedCircleSet(options)

  if (eventList.length === 0) {
    found.add('profile.event_count_invalid', 'profile verification requires at least one event')
  }

  if (profile.federation === undefined && eventList.length !== 1) {
    found.add('profile.event_count_invalid', 'profile expects exactly one assertion event')
  }
  if (profile.federation !== undefined) {
    if (eventList.length < profile.federation.minCircles) {
      found.add('federation.invalid', `profile federation requires at least ${profile.federation.minCircles} circles`)
    }
    if (profile.federation.requireScope) {
      for (let i = 0; i < eventList.length; i++) {
        if (tagValues(readableEvent(eventList[i]), 'veil-scope').length !== 1) {
          found.add('federation.invalid', `event[${i}] federation profile requires exactly one veil-scope tag`, `event[${i}]`)
        }
      }
    }
  }

  // Undefined when the caller's now cannot be compared. Then no date is
  // compared against it, here or for NIP-40 expiry, and the run fails for that.
  const now = verificationTime(options.now)
  if (now === undefined) found.add('verification.now_invalid', NOW_INVALID)
  const minDistinctSigners = minDistinctSignersFrom(profile, options, found)
  const maxAgeSeconds = maxAgeSecondsFrom(profile, options, found)
  const maxFutureSeconds = maxFutureSecondsFrom(options, maxAgeSeconds, found)
  const verifiedEvents = eventList.map((event, index) => verifyEvent(
    profile,
    event,
    index,
    options,
    acceptedCircles,
    minDistinctSigners,
    now,
    maxAgeSeconds,
    maxFutureSeconds,
    found,
  ))

  const federation = profile.federation === undefined
    ? undefined
    : verifyFederation(eventList, options.aggregateFn)
  if (federation !== undefined) {
    if (!federation.valid) {
      // Whatever the federation check says, and it quotes the events, it is a federation failure
      for (const error of federation.errors) found.add('federation.invalid', `federation: ${error}`)
    }
    if (minDistinctSigners !== undefined && federation.distinctSigners < minDistinctSigners) {
      found.add('federation.threshold_not_met', `federation has fewer than ${minDistinctSigners} distinct signers`)
    }
  }

  return {
    valid: found.length === 0,
    errors: found.errors,
    issues: found.issues,
    events: verifiedEvents,
    federation,
    profile,
  }
}
