import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import type { EventTemplate } from '../nip85/types.js'
import { NIP85_KINDS } from '../nip85/types.js'
import type {
  AggregateFn,
  AggregateName,
  Contribution,
  ProofContext,
  ProofVersion,
  SubjectTag,
  TrustCircle,
} from './types.js'
import { canonicalMessage, canonicalMessageV2, computeCircleId, electionId, electionIdV2 } from './circle.js'
import { reservedMetricNameReason } from './metric-names.js'

/**
 * Tags the publisher may set on a veil event. The circle does not sign them:
 * the publisher's own Nostr signature covers them, as it covers `content`.
 */
export interface PublisherTagOptions {
  /** NIP-40 expiration: unix time in seconds, emitted as an `expiration` tag. */
  expiration?: number
  /** NIP-31 alt: a short human-readable summary, emitted as an `alt` tag. */
  alt?: string
}

export type AggregateOptions = AggregateFn | ({
  aggregateFn?: AggregateFn
  aggregate?: AggregateName
  kind?: number
  proofVersion?: ProofVersion
} & PublisherTagOptions)
export type TypedAggregateOptions = AggregateFn | ({
  aggregateFn?: AggregateFn
  aggregate?: AggregateName
  proofVersion?: ProofVersion
} & PublisherTagOptions)

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * Built-in named aggregate functions. The `veil-agg` tag records which one
 * produced an event's metric tags, letting `verifyProof` recompute the
 * aggregate without the function being supplied out-of-band.
 */
export const AGGREGATES: Record<AggregateName, AggregateFn> = {
  median,
  mean: values => Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  sum: values => values.reduce((a, b) => a + b, 0),
  min: values => Math.min(...values),
  max: values => Math.max(...values),
}

/** True if `name` is a recognised built-in aggregate function. */
export function isAggregateName(name: string): name is AggregateName {
  return Object.prototype.hasOwnProperty.call(AGGREGATES, name)
}

function serialiseSig(sig: Contribution['signature']): string {
  // Deterministic sorted-key serialisation. The `ring` and `keyImage` fields
  // are excluded — ring is in the veil-ring tag, keyImage is the third element
  // of the veil-sig tag. Uses a replacer function (not an array allowlist)
  // to guarantee alphabetical key order across all JS engines.
  const obj: Record<string, unknown> = {
    c0: sig.c0,
    electionId: sig.electionId,
    message: sig.message,
    responses: sig.responses,
  }
  if (sig.domain !== undefined) {
    obj.domain = sig.domain
  }
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k]
    }
    return sorted
  })
}

function publisherTags(options: AggregateOptions | undefined): string[][] {
  if (typeof options !== 'object' || options === null) return []
  const tags: string[][] = []
  const { expiration, alt } = options as PublisherTagOptions & Record<string, unknown>
  if (expiration !== undefined) {
    if (typeof expiration !== 'number' || !Number.isSafeInteger(expiration) || expiration < 0) {
      throw new Error('expiration must be a unix time in seconds: a non-negative safe integer')
    }
    tags.push(['expiration', String(expiration)])
  }
  if (alt !== undefined) {
    if (typeof alt !== 'string' || alt === '') {
      throw new Error('alt must be a non-empty string')
    }
    tags.push(['alt', alt])
  }
  return tags
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function resolveAggregate(options?: AggregateOptions): {
  aggregateFn: AggregateFn
  aggName: AggregateName | 'custom'
  kind: number
  proofVersion: ProofVersion | undefined
} {
  let aggregateFn: AggregateFn
  let aggName: AggregateName | 'custom'
  if (typeof options === 'function') {
    aggregateFn = options
    aggName = 'custom'
  } else if (options?.aggregate !== undefined) {
    if (!isAggregateName(options.aggregate)) {
      throw new Error(`Unknown aggregate function: ${options.aggregate}`)
    }
    aggregateFn = AGGREGATES[options.aggregate]
    aggName = options.aggregate
  } else if (options?.aggregateFn !== undefined) {
    aggregateFn = options.aggregateFn
    aggName = 'custom'
  } else {
    aggregateFn = median
    aggName = 'median'
  }
  const kind = typeof options === 'object' && options !== null && 'kind' in options
    ? options.kind ?? NIP85_KINDS.USER
    : NIP85_KINDS.USER
  const proofVersion = typeof options === 'object' && options !== null ? options.proofVersion : undefined
  return { aggregateFn, aggName, kind, proofVersion }
}

function optionsWithKind(options: TypedAggregateOptions | undefined, kind: number): AggregateOptions {
  if (typeof options === 'function') return { aggregateFn: options, kind }
  return { ...options, kind }
}

function assertHex64(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`)
  }
}

function assertAddress(value: string): void {
  if (!/^(0|[1-9]\d*):[0-9a-f]{64}:.*$/.test(value)) {
    throw new Error('address must be a NIP-33 address: kind:pubkey:d-tag')
  }
}

function assertKTag(value: string): void {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(value)) {
    throw new Error('kTag must be a NIP-73 type of 1 to 64 printable ASCII characters without spaces, such as web or isbn')
  }
}

function assertSubjectTag(value: string): asserts value is SubjectTag {
  if (value !== 'p' && value !== 'e' && value !== 'a' && value !== 'k') {
    throw new Error(`Unsupported v2 subject tag: ${value}`)
  }
}

function resolveV2Context(
  subject: string,
  kind: number,
  subjectTags: string[][],
): Required<Pick<ProofContext, 'kind' | 'subjectTag' | 'subjectTagValue'>> {
  const tag = subjectTags[0]
  if (tag === undefined || typeof tag[0] !== 'string' || typeof tag[1] !== 'string' || tag[1] === '') {
    throw new Error('proof v2 requires a non-empty subject hint tag')
  }
  assertSubjectTag(tag[0])
  return {
    kind,
    subjectTag: tag[0],
    subjectTagValue: tag[1] ?? subject,
  }
}

/** The proof version a contribution was signed with, read from its signed message. */
function contributionVersion(contribution: Contribution): ProofVersion {
  try {
    const parsed: unknown = JSON.parse(contribution.signature.message)
    return typeof parsed === 'object' && parsed !== null && (parsed as { proofVersion?: unknown }).proofVersion === 'v2' ? 'v2' : 'v1'
  } catch {
    return 'v1'
  }
}

/**
 * An explicit proofVersion wins. Otherwise follow the contributions, so an
 * aggregator on this release still combines v1 contributions from members on
 * an older one; contributions that mix versions cannot be combined.
 */
function resolveProofVersion(requested: ProofVersion | undefined, contributions: Contribution[]): ProofVersion {
  const versions = new Set(contributions.map(contributionVersion))
  if (versions.size > 1) {
    throw new Error('Contributions mix proof versions v1 and v2; every member must sign with the same version')
  }
  const signed = versions.values().next().value as ProofVersion | undefined
  if (requested !== undefined && signed !== undefined && requested !== signed) {
    throw new Error(`Contributions were signed as proof ${signed}, but proofVersion ${requested} was requested`)
  }
  return requested ?? signed ?? 'v2'
}

/** Name the mismatch when a v2 contribution was signed for another kind or subject tag. */
function assertV2ContextMatches(
  contributions: Contribution[],
  context: Required<Pick<ProofContext, 'kind' | 'subjectTag' | 'subjectTagValue'>>,
): void {
  for (let i = 0; i < contributions.length; i++) {
    let signed: { kind?: unknown; subjectTag?: unknown }
    try {
      signed = JSON.parse(contributions[i].signature.message) as { kind?: unknown; subjectTag?: unknown }
    } catch {
      continue
    }
    if (signed.kind !== context.kind || signed.subjectTag !== context.subjectTag) {
      throw new Error(
        `Contribution index ${i} was signed for kind ${String(signed.kind)} with subject tag ${String(signed.subjectTag)}, ` +
        `but this event is kind ${context.kind} with subject tag ${context.subjectTag}. ` +
        'Use the matching typed helpers (contributeEventAssertion with aggregateEventContributions, and so on), or proofVersion v1 throughout.',
      )
    }
  }
}

function aggregateContributionsWithSubjectTags(
  circle: TrustCircle,
  subject: string,
  contributions: Contribution[],
  options: AggregateOptions | undefined,
  subjectTags: string[][],
): EventTemplate {
  const { aggregateFn, aggName, kind, proofVersion: requested } = resolveAggregate(options)
  const proofVersion = resolveProofVersion(requested, contributions)
  const publisherTagList = publisherTags(options)
  if (circle.size !== circle.members.length) {
    throw new Error(`Trust circle size mismatch: size=${circle.size}, members=${circle.members.length}`)
  }
  if (circle.circleId !== computeCircleId(circle.members)) {
    throw new Error('Trust circle circleId does not match its members')
  }

  const proofContext = proofVersion === 'v2'
    ? resolveV2Context(subject, kind, subjectTags)
    : undefined
  if (proofContext !== undefined) assertV2ContextMatches(contributions, proofContext)
  const scope = circle.scope ?? circle.circleId
  const expectedElectionId = proofContext === undefined
    ? electionId(scope, subject)
    : electionIdV2(scope, subject, proofContext)

  // Validate all signatures
  for (let i = 0; i < contributions.length; i++) {
    const contribution = contributions[i]
    if (contribution.keyImage !== contribution.signature.keyImage) {
      throw new Error(`Detached key image does not match signature at contribution index ${i}`)
    }
    if (!sameStringArray(contribution.signature.ring, circle.members)) {
      throw new Error(`Signature ring does not match trust circle at contribution index ${i}`)
    }
    if (contribution.signature.electionId !== expectedElectionId) {
      throw new Error(`Signature electionId does not match trust circle subject at contribution index ${i}`)
    }
    for (const name of Object.keys(contribution.metrics)) {
      const reason = reservedMetricNameReason(name)
      if (reason !== undefined) throw new Error(`${reason} (contribution index ${i})`)
    }
    const expectedMessage = proofContext === undefined
      ? canonicalMessage(circle.circleId, subject, contribution.metrics)
      : canonicalMessageV2(circle.circleId, subject, contribution.metrics, proofContext)
    if (contribution.signature.message !== expectedMessage) {
      throw new Error(`Signature signed message does not match contribution metrics at contribution index ${i}`)
    }
    if (!lsagVerify(contribution.signature)) {
      throw new Error(`Invalid LSAG signature at contribution index ${i}`)
    }
  }

  // Check key image uniqueness
  const keyImages: string[] = []
  for (const c of contributions) {
    if (hasDuplicateKeyImage(c.keyImage, keyImages)) {
      throw new Error(`Duplicate key image detected: ${c.keyImage}`)
    }
    keyImages.push(c.keyImage)
  }

  // Aggregate metrics
  const allMetricKeys = new Set<string>()
  for (const c of contributions) {
    for (const key of Object.keys(c.metrics)) allMetricKeys.add(key)
  }
  const aggregatedMetrics: Record<string, number> = {}
  for (const key of allMetricKeys) {
    const values = contributions
      .map(c => (Object.hasOwn(c.metrics, key) ? c.metrics[key] : undefined))
      .filter((v): v is number => v !== undefined)
    const aggregated = aggregateFn(values)
    if (!Number.isFinite(aggregated)) {
      throw new Error(`aggregateFn returned non-finite value for metric "${key}": ${aggregated}`)
    }
    aggregatedMetrics[key] = aggregated
  }

  const metricTags = Object.entries(aggregatedMetrics).map(([k, v]) => [k, String(v)])
  const sigTags = contributions.map(c => ['veil-sig', serialiseSig(c.signature), c.keyImage])

  const tags: string[][] = [
    ['d', subject],
    ...subjectTags,
    ...publisherTagList,
    ...metricTags,
    ['veil-ring', ...circle.members],
    ['veil-threshold', String(contributions.length), String(circle.size)],
    ['veil-agg', aggName],
  ]
  if (proofVersion === 'v2') {
    tags.push(['veil-version', '2'])
  }
  // Only a scoped circle emits veil-scope: unscoped events stay byte-identical
  // to pre-veil-scope output, and verifyProof treats an absent tag as circle-scoped.
  if (circle.scope !== undefined) {
    tags.push(['veil-scope', circle.scope])
  }
  tags.push(...sigTags)

  return { kind, tags, content: '' }
}

/**
 * Aggregate multiple anonymous contributions into a single NIP-85 event.
 *
 * Validates all LSAG signatures and checks key image uniqueness before
 * aggregating metrics (default: median). The result is a standard NIP-85
 * event with additional `veil-ring`, `veil-threshold`, `veil-agg`, `veil-sig`,
 * and -- for a circle with a federation scope -- `veil-scope` tags.
 *
 * @param circle - Trust circle the contributions belong to
 * @param subject - The d-tag value (must match what contributors signed)
 * @param contributions - Array of {@link Contribution} objects from circle members
 * @param options - Optional configuration
 * @param options.aggregate - Name of a built-in aggregate function: 'median' (default), 'mean', 'sum', 'min', or 'max'. Recorded in the `veil-agg` tag so verifiers can recompute the aggregate automatically.
 * @param options.aggregateFn - A custom function to combine metric values. Recorded as `veil-agg: custom`; verifiers must be passed the same function. Prefer `aggregate` for the standard functions.
 * @param options.kind - NIP-85 assertion kind (default: 30382 USER). This
 *   legacy option is kept for compatibility and still emits the user-style
 *   `p` subject tag. Prefer `aggregateEventContributions`,
 *   `aggregateAddressableContributions`, or `aggregateIdentifierContributions`
 *   for non-user assertion kinds.
 * @param options.expiration - Optional NIP-40 expiration, unix time in seconds.
 *   Emitted as an `expiration` tag. The circle does not sign it; the
 *   publisher's Nostr signature covers it. The typed helpers accept it too.
 * @param options.alt - Optional NIP-31 alt text, emitted as an `alt` tag on the
 *   same terms as `expiration`.
 * @returns An unsigned {@link EventTemplate} with proof tags — sign and publish as a standard Nostr event
 * @throws If any LSAG signature is invalid, duplicate key images are detected, an unknown aggregate name is supplied, or `expiration` or `alt` is malformed
 */
export function aggregateContributions(
  circle: TrustCircle,
  subject: string,
  contributions: Contribution[],
  options?: AggregateOptions
): EventTemplate {
  return aggregateContributionsWithSubjectTags(circle, subject, contributions, options, [['p', subject]])
}

/**
 * Aggregate anonymous contributions into a kind 30383 event assertion.
 *
 * Emits `d` and `e` tags that both point at the event id. The proof format is
 * still the backwards-compatible v1 format, so `verifyProof` works unchanged.
 */
export function aggregateEventContributions(
  circle: TrustCircle,
  eventId: string,
  contributions: Contribution[],
  options?: TypedAggregateOptions,
): EventTemplate {
  assertHex64(eventId, 'eventId')
  return aggregateContributionsWithSubjectTags(
    circle,
    eventId,
    contributions,
    optionsWithKind(options, NIP85_KINDS.EVENT),
    [['e', eventId]],
  )
}

/**
 * Aggregate anonymous contributions into a kind 30384 addressable event assertion.
 *
 * Emits `d` and `a` tags that both point at the NIP-33 address. The proof
 * format is still the backwards-compatible v1 format, so `verifyProof` works
 * unchanged.
 */
export function aggregateAddressableContributions(
  circle: TrustCircle,
  address: string,
  contributions: Contribution[],
  options?: TypedAggregateOptions,
): EventTemplate {
  assertAddress(address)
  return aggregateContributionsWithSubjectTags(
    circle,
    address,
    contributions,
    optionsWithKind(options, NIP85_KINDS.ADDRESSABLE),
    [['a', address]],
  )
}

/**
 * Aggregate anonymous contributions into a kind 30385 identifier assertion.
 *
 * Emits `d` for the identifier and `k` for its NIP-73 type (`web`, `isbn`,
 * `podcast:guid`, `<blockchain>:tx` and so on). Pass `{ proofVersion: 'v2' }`
 * to bind the kind and `k` value into the signed messages.
 */
export function aggregateIdentifierContributions(
  circle: TrustCircle,
  identifier: string,
  kTag: string,
  contributions: Contribution[],
  options?: TypedAggregateOptions,
): EventTemplate {
  if (identifier === '') {
    throw new Error('identifier must be non-empty')
  }
  assertKTag(kTag)
  return aggregateContributionsWithSubjectTags(
    circle,
    identifier,
    contributions,
    optionsWithKind(options, NIP85_KINDS.IDENTIFIER),
    [['k', kTag]],
  )
}
