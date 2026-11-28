import type { VerifyLimits } from './verify.js'

/** The longest fixed proof tag name, `veil-threshold`, so no fixed tag is ever over the name limit */
const LONGEST_FIXED_TAG_NAME = 'veil-threshold'.length
/**
 * Tags allowed beyond a signature from every member and every metric: the
 * twelve fixed tags a proof can carry, and some to spare.
 */
const TAG_COUNT_ALLOWANCE = 72

/** Every limit, in the order a malformed one is reported. */
const LIMIT_FIELDS = [
  'maxRingSize',
  'maxSigPayloadBytes',
  'maxSignedMessageBytes',
  'maxMetricCount',
  'maxMetricNameLength',
  'maxTagCount',
  'maxSubjectLength',
] as const

/** The limits with every field set, as the verifiers apply them. */
export type ResolvedLimits = Required<VerifyLimits>

/** How an event is over a limit, found before any check reads its tags. */
export type EventLimitExcess =
  | { kind: 'tags'; count: number; limit: number }
  | { kind: 'name'; limit: number }
  | { kind: 'subject'; limit: number }

/**
 * The caller's limits over the defaults. A limit left out, or given as
 * `undefined`, takes its default, so it can never switch its check off. The
 * tag count, left out, follows the ring and metric limits, so a caller who
 * raises those raises it with them.
 */
export function resolveLimits(defaults: VerifyLimits, override?: Partial<VerifyLimits>): ResolvedLimits {
  // Only the caller's own fields, as a spread of them reads them, which is how
  // they were always read: not inherited ones, and none of a value that is
  // neither an object nor a function. Held with no prototype, so a field the
  // caller leaves out is never read from Object.prototype.
  const given: Partial<Record<string, unknown>> = Object.assign(Object.create(null) as Record<string, unknown>, override)
  const pick = (field: keyof VerifyLimits): number => (given[field] === undefined ? defaults[field] : given[field]) as number
  const maxRingSize = pick('maxRingSize')
  const maxMetricCount = pick('maxMetricCount')
  // Only numbers are added up. Anything else, which can throw when it is, is
  // reported as the limit it is in, before the tag count
  const derivedTagCount = typeof maxRingSize === 'number' && typeof maxMetricCount === 'number'
    ? maxRingSize + maxMetricCount + TAG_COUNT_ALLOWANCE
    : Number.NaN
  return {
    maxRingSize,
    maxSigPayloadBytes: pick('maxSigPayloadBytes'),
    maxSignedMessageBytes: pick('maxSignedMessageBytes'),
    maxMetricCount,
    maxMetricNameLength: pick('maxMetricNameLength'),
    maxTagCount: given.maxTagCount === undefined ? derivedTagCount : given.maxTagCount as number,
    maxSubjectLength: pick('maxSubjectLength'),
  }
}

/** A number of zero or more. `Infinity` lifts the limit, and `NaN` is not one. */
function isLimit(value: unknown): boolean {
  return typeof value === 'number' && value >= 0
}

/**
 * The first limit that is not a limit. Compared against `NaN` or a word,
 * every count is within it, so the check would be switched off: each limit is
 * checked here, and a malformed one fails the run closed.
 */
export function limitsProblem(limits: ResolvedLimits): string | undefined {
  // The derived tag count is malformed only where the ring or metric limit is, which is named first
  const field = LIMIT_FIELDS.find(name => !isLimit(limits[name]))
  return field === undefined ? undefined : `limits.${field} must be a non-negative number`
}

/**
 * Whether an event has more tags than the limit, a tag name longer than any
 * proof tag or signed metric can have, or a `d` tag longer than the subject
 * limit. Tags that are not a list are left to the checks that follow, which
 * turn them away, and so is a tag that is not a list with a string name.
 *
 * Every other name that long names a metric no contribution could sign, so
 * its event was turned away before, after its name was quoted. A name that
 * begins `veil-` and is not a proof tag's is passed over by every check and
 * quoted by none, so it is let be.
 */
export function eventLimitExcess(event: unknown, limits: ResolvedLimits): EventLimitExcess | undefined {
  const tags = event !== null && typeof event === 'object' ? (event as { tags?: unknown }).tags : undefined
  if (!Array.isArray(tags)) return undefined
  if (tags.length > limits.maxTagCount) return { kind: 'tags', count: tags.length, limit: limits.maxTagCount }
  const nameLimit = Math.max(limits.maxMetricNameLength, LONGEST_FIXED_TAG_NAME)
  for (const tag of tags) {
    if (!Array.isArray(tag) || typeof tag[0] !== 'string') continue
    if (tag[0].length > nameLimit && !tag[0].startsWith('veil-')) return { kind: 'name', limit: nameLimit }
    if (tag[0] === 'd' && typeof tag[1] === 'string' && tag[1].length > limits.maxSubjectLength) {
      return { kind: 'subject', limit: limits.maxSubjectLength }
    }
  }
  return undefined
}

/** What is over the limit, after "Event" or an event's place. It quotes nothing from the event. */
export function limitExcessText(excess: EventLimitExcess): string {
  if (excess.kind === 'tags') return `has ${excess.count} tags, more than the limit of ${excess.limit}`
  if (excess.kind === 'name') return `has a tag name longer than ${excess.limit} characters`
  return `has a d tag longer than ${excess.limit} characters`
}
