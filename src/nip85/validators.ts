import type { ValidationResult } from './types.js'
import { NIP85_KINDS } from './types.js'

const ASSERTION_KINDS = new Set<number>([
  NIP85_KINDS.USER,
  NIP85_KINDS.EVENT,
  NIP85_KINDS.ADDRESSABLE,
  NIP85_KINDS.IDENTIFIER,
])

interface RawEvent {
  kind: number
  tags: string[][]
  content: string
}

export interface ValidationOptions {
  /**
   * Enable kind-specific NIP-85 checks. Loose validation is kept as the default
   * for backwards compatibility with older callers and extension tags.
   */
  strict?: boolean
}

const HEX64_RE = /^[0-9a-f]{64}$/
const DECIMAL_INTEGER_RE = /^(0|[1-9]\d*)$/
const ADDRESS_RE = /^(0|[1-9]\d*):[0-9a-f]{64}:.*$/
const PROVIDER_TAG_RE = /^(0|[1-9]\d*):[A-Za-z0-9_.-]+$/
const RELAY_HINT_RE = /^wss?:\/\/.+$/i
const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

const LOOSE_NUMERIC_METRICS = new Set([
  'rank',
  'followers',
  'following',
  'zap_amt_sent',
  'zap_amt_recd',
  'zap_cnt_sent',
  'zap_cnt_recd',
  'post_cnt',
  'reply_cnt',
  'repost_cnt',
  'reaction_cnt',
])

const USER_NUMERIC_METRICS = new Set([
  'followers',
  'rank',
  'first_created_at',
  'post_cnt',
  'reply_cnt',
  'reactions_cnt',
  'zap_amt_recd',
  'zap_amt_sent',
  'zap_cnt_recd',
  'zap_cnt_sent',
  'zap_avg_amt_day_recd',
  'zap_avg_amt_day_sent',
  'reports_cnt_recd',
  'reports_cnt_sent',
  'active_hours_start',
  'active_hours_end',
])
const USER_STRING_METRICS = new Set(['t'])
const EVENT_NUMERIC_METRICS = new Set([
  'rank',
  'comment_cnt',
  'quote_cnt',
  'repost_cnt',
  'reaction_cnt',
  'zap_cnt',
  'zap_amount',
])
const IDENTIFIER_NUMERIC_METRICS = new Set(['rank', 'comment_cnt', 'reaction_cnt'])

function tagValues(event: RawEvent, name: string): string[] {
  return event.tags.filter(t => t[0] === name).map(t => t[1]).filter((v): v is string => typeof v === 'string')
}

function isFiniteNumberTag(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false
  return Number.isFinite(Number(value))
}

function validateLooseRank(value: string | undefined, errors: string[]): void {
  const rankValue = Number(value)
  if (isNaN(rankValue) || rankValue < 0 || rankValue > 100) {
    errors.push(`Invalid rank value: "${value}". Must be a number between 0 and 100.`)
  }
}

function validateStrictRank(value: string | undefined, errors: string[]): void {
  const rankValue = Number(value)
  if (value === undefined || value.trim() === '' || !Number.isFinite(rankValue) || rankValue < 0 || rankValue > 100) {
    errors.push(`Invalid rank value: "${value}". Must be a number between 0 and 100.`)
  }
}

function requireSingletonTag(event: RawEvent, name: string, errors: string[]): string | undefined {
  const values = tagValues(event, name)
  if (values.length === 0) {
    errors.push(`Missing required ${name}-tag.`)
    return undefined
  }
  if (values.length > 1) {
    errors.push(`Duplicate ${name}-tag.`)
  }
  return values[0]
}

function validateOptionalMatchingTag(
  event: RawEvent,
  name: string,
  subject: string,
  errors: string[],
): void {
  const values = tagValues(event, name)
  if (values.length === 0) return
  if (values.length > 1) {
    errors.push(`Duplicate ${name}-tag.`)
  }
  if (values[0] !== subject) {
    errors.push(`${name}-tag must match d-tag.`)
  }
}

function validateStrictSubjectTags(event: RawEvent, errors: string[]): void {
  const subject = requireSingletonTag(event, 'd', errors)
  if (subject === undefined) return

  switch (event.kind) {
    case NIP85_KINDS.USER:
      if (!HEX64_RE.test(subject)) {
        errors.push('User assertion d-tag must be a 64-character lowercase hex pubkey.')
      }
      validateOptionalMatchingTag(event, 'p', subject, errors)
      break
    case NIP85_KINDS.EVENT:
      if (!HEX64_RE.test(subject)) {
        errors.push('Event assertion d-tag must be a 64-character lowercase hex event id.')
      }
      validateOptionalMatchingTag(event, 'e', subject, errors)
      break
    case NIP85_KINDS.ADDRESSABLE:
      if (!ADDRESS_RE.test(subject)) {
        errors.push('Addressable assertion d-tag must be a NIP-33 address: kind:pubkey:d-tag.')
      }
      validateOptionalMatchingTag(event, 'a', subject, errors)
      break
    case NIP85_KINDS.IDENTIFIER: {
      if (subject === '') {
        errors.push('Identifier assertion d-tag must be non-empty.')
      }
      const kTag = requireSingletonTag(event, 'k', errors)
      if (kTag !== undefined && !DECIMAL_INTEGER_RE.test(kTag)) {
        errors.push('Identifier assertion k-tag must be a decimal kind number.')
      }
      break
    }
  }
}

function strictMetricSets(kind: number): { numeric: Set<string>; string: Set<string> } | undefined {
  switch (kind) {
    case NIP85_KINDS.USER:
      return { numeric: USER_NUMERIC_METRICS, string: USER_STRING_METRICS }
    case NIP85_KINDS.EVENT:
    case NIP85_KINDS.ADDRESSABLE:
      return { numeric: EVENT_NUMERIC_METRICS, string: new Set() }
    case NIP85_KINDS.IDENTIFIER:
      return { numeric: IDENTIFIER_NUMERIC_METRICS, string: new Set() }
    default:
      return undefined
  }
}

function validateStrictMetrics(event: RawEvent, errors: string[]): void {
  const allowed = strictMetricSets(event.kind)
  if (allowed === undefined) return

  const seen = new Set<string>()
  for (const tag of event.tags) {
    const name = tag[0]
    if (META_TAGS.has(name) || name.startsWith('veil-')) continue
    if (seen.has(name)) {
      errors.push(`Duplicate metric tag "${name}".`)
      continue
    }
    seen.add(name)

    if (!allowed.numeric.has(name) && !allowed.string.has(name)) {
      errors.push(`Unknown metric tag "${name}" for kind ${event.kind}.`)
      continue
    }
    if (tag[1] === undefined) {
      errors.push(`Metric "${name}" is missing a value.`)
      continue
    }
    if (name === 'rank') {
      validateStrictRank(tag[1], errors)
    } else if (allowed.numeric.has(name) && !isFiniteNumberTag(tag[1])) {
      errors.push(`Invalid metric "${name}": "${tag[1]}" is not a finite number.`)
    }
  }
}

/**
 * Validates a NIP-85 assertion event.
 *
 * Checks:
 * - `kind` is one of the four NIP-85 assertion kinds (30382–30385)
 * - A `d` tag is present
 * - `rank`, if present, is a number in the range 0–100
 * - when `{ strict: true }` is passed, kind-specific metric names are checked
 *   and optional subject hint tags (`p`, `e`, `a`) are validated if present
 *
 * @param event - A raw Nostr event with `kind`, `tags`, and `content` fields
 * @param options - Optional validation mode. Strict mode is additive and opt-in.
 * @returns A {@link ValidationResult} with `valid` boolean and an array of error strings
 *
 * @example
 * const result = validateAssertion(event)
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors)
 * }
 */
export function validateAssertion(event: RawEvent, options: ValidationOptions = {}): ValidationResult {
  const errors: string[] = []

  if (!ASSERTION_KINDS.has(event.kind)) {
    errors.push(`Invalid kind: ${event.kind}. Must be one of 30382, 30383, 30384, 30385.`)
  }

  const dTag = event.tags.find(t => t[0] === 'd')
  if (!dTag) {
    errors.push('Missing required d-tag.')
  }

  const rankTag = event.tags.find(t => t[0] === 'rank')
  if (rankTag !== undefined) {
    validateLooseRank(rankTag[1], errors)
  }

  // Validate all numeric metric tags are finite numbers
  for (const tag of event.tags) {
    if (LOOSE_NUMERIC_METRICS.has(tag[0]) && tag[0] !== 'rank') {
      const value = Number(tag[1])
      if (!Number.isFinite(value)) {
        errors.push(`Invalid metric "${tag[0]}": "${tag[1]}" is not a finite number.`)
      }
    }
  }

  if (options.strict) {
    validateStrictSubjectTags(event, errors)
    validateStrictMetrics(event, errors)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Strict NIP-85 assertion validation. This is equivalent to
 * `validateAssertion(event, { strict: true })`.
 */
export function validateAssertionStrict(event: RawEvent): ValidationResult {
  return validateAssertion(event, { strict: true })
}

/**
 * Strict validation for plaintext kind 10040 provider declarations.
 *
 * Encrypted provider declarations cannot be inspected without a decrypt
 * function, so this validator accepts the standard encrypted form when content
 * is non-empty and plaintext tags are omitted.
 */
export function validateProviderDeclarationStrict(event: RawEvent): ValidationResult {
  const errors: string[] = []

  if (event.kind !== NIP85_KINDS.PROVIDER) {
    errors.push(`Invalid kind: ${event.kind}. Must be 10040 for a provider declaration.`)
  }

  if (event.content !== '' && event.tags.length === 0) {
    return { valid: errors.length === 0, errors }
  }

  if (event.tags.length === 0) {
    errors.push('Provider declaration must contain at least one provider tag or encrypted content.')
  }

  const seen = new Set<string>()
  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i]
    const name = tag[0]
    if (typeof name !== 'string' || !PROVIDER_TAG_RE.test(name)) {
      errors.push(`Provider tag at index ${i} must use kind:metric format.`)
      continue
    }

    const [kindText, metric] = name.split(':')
    const kind = Number(kindText)
    if (!ASSERTION_KINDS.has(kind)) {
      errors.push(`Provider tag at index ${i} has unsupported assertion kind: ${kindText}.`)
    }
    if (metric === '') {
      errors.push(`Provider tag at index ${i} has an empty metric name.`)
    }

    const key = `${kindText}:${metric}:${tag[1] ?? ''}`
    if (seen.has(key)) {
      errors.push(`Duplicate provider declaration for ${kindText}:${metric}.`)
    }
    seen.add(key)

    const servicePubkey = tag[1]
    if (typeof servicePubkey !== 'string' || !HEX64_RE.test(servicePubkey)) {
      errors.push(`Provider tag at index ${i} service pubkey must be a 64-character lowercase hex pubkey.`)
    }

    const relayHint = tag[2]
    if (relayHint !== undefined && relayHint !== '' && !RELAY_HINT_RE.test(relayHint)) {
      errors.push(`Provider tag at index ${i} relay hint must be a websocket URL.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
