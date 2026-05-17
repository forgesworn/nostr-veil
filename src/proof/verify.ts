import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import {
  canonicalMessage,
  canonicalMessageV2,
  computeCircleId,
  electionId,
  electionIdV2,
  MAX_SCOPE_LENGTH,
  SCOPE_RE,
} from './circle.js'
import type { AggregateFn, ProofContext, ProofVerification, ProofVersion, SubjectTag } from './types.js'
import { AGGREGATES, isAggregateName } from './aggregate.js'

/**
 * Verify all LSAG ring signatures in a Veil-enhanced NIP-85 event.
 *
 * Checks each `veil-sig` tag against the `veil-ring`, confirms key images are
 * distinct (no double-signing), validates the threshold metadata, and confirms
 * the published metric tags match the aggregate (named by the `veil-agg` tag) of the signed contribution messages.
 *
 * @param event - A Nostr event (or template) containing `veil-ring`, `veil-threshold`, and `veil-sig` tags
 * @param options - Optional aggregate function, needed only for events whose `veil-agg` tag is `custom`. Named aggregates are resolved from the tag automatically.
 * @returns A {@link ProofVerification} with `valid`, `circleSize`, `threshold`, `distinctSigners`, and any `errors`
 */
export interface VerifyLimits {
  /** Maximum pubkeys accepted in a veil-ring. */
  maxRingSize: number
  /** Maximum serialised JSON payload bytes/chars in one veil-sig tag. */
  maxSigPayloadBytes: number
  /** Maximum canonical signed message bytes/chars inside one signature. */
  maxSignedMessageBytes: number
  /** Maximum number of metric entries inside one signed message. */
  maxMetricCount: number
  /** Maximum metric tag name length inside one signed message. */
  maxMetricNameLength: number
}

export const DEFAULT_VERIFY_LIMITS: VerifyLimits = {
  maxRingSize: 1000,
  maxSigPayloadBytes: 128_000,
  maxSignedMessageBytes: 16_384,
  maxMetricCount: 128,
  maxMetricNameLength: 64,
}

const HEX64_RE = /^[0-9a-f]{64}$/
const KEY_IMAGE_RE = /^[0-9a-f]{66}$/
const DECIMAL_INTEGER_RE = /^(0|[1-9]\d*)$/
const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

export type VerifyOptions = AggregateFn | {
  aggregateFn?: AggregateFn
  limits?: Partial<VerifyLimits>
  requireProofVersion?: ProofVersion
}

interface SignedMessageV1 {
  circleId: string
  subject: string
  metrics: Record<string, number>
  proofVersion?: undefined
}

interface SignedMessageV2 {
  circleId: string
  subject: string
  metrics: Record<string, number>
  proofVersion: 'v2'
  kind: number
  subjectTag: SubjectTag
  subjectTagValue: string
}

type SignedMessage = SignedMessageV1 | SignedMessageV2

function aggregateFnFromOptions(options?: VerifyOptions): AggregateFn {
  return typeof options === 'function'
    ? options
    : options?.aggregateFn ?? AGGREGATES.median
}

function limitsFromOptions(options?: VerifyOptions): VerifyLimits {
  const override = typeof options === 'function' ? undefined : options?.limits
  return { ...DEFAULT_VERIFY_LIMITS, ...override }
}

function requiredProofVersion(options?: VerifyOptions): ProofVersion | undefined {
  return typeof options === 'function' ? undefined : options?.requireProofVersion
}

/**
 * Determine which aggregate function to verify the metric tags against.
 * Reads the `veil-agg` tag; an absent tag means median (pre-veil-agg events).
 * Returns null and records an error when the function cannot be determined.
 */
function resolveAggregateFn(
  tags: string[][],
  options: VerifyOptions | undefined,
  errors: string[],
): AggregateFn | null {
  const aggTags = tags.filter(t => t[0] === 'veil-agg')
  if (aggTags.length > 1) {
    errors.push('Multiple veil-agg tags')
    return null
  }
  if (aggTags.length === 0) {
    // No veil-agg tag: pre-veil-agg event, median unless the caller overrides.
    return aggregateFnFromOptions(options)
  }
  const value = aggTags[0][1]
  if (typeof value !== 'string' || value === '') {
    errors.push('Invalid veil-agg tag')
    return null
  }
  if (value === 'custom') {
    if (typeof options === 'function' || options?.aggregateFn) {
      return aggregateFnFromOptions(options)
    }
    errors.push('veil-agg is "custom": pass the aggregate function via options to verify the metric tags')
    return null
  }
  if (!isAggregateName(value)) {
    errors.push(`Unknown veil-agg function: ${value}`)
    return null
  }
  return AGGREGATES[value]
}

/**
 * Resolve the dedup scope an event's electionIds are built from. A `veil-scope`
 * tag names a federation scope shared across circles. Absent, the scope is the
 * circleId: per-circle isolation, and how every pre-veil-scope event verifies.
 * Returns null and records an error when the tag is malformed.
 */
function resolveScope(tags: string[][], circleId: string, errors: string[]): string | null {
  const scopeTags = tags.filter(t => t[0] === 'veil-scope')
  if (scopeTags.length > 1) {
    errors.push('Multiple veil-scope tags')
    return null
  }
  if (scopeTags.length === 0) {
    return circleId
  }
  const value = scopeTags[0][1]
  if (typeof value !== 'string' || value === '') {
    errors.push('Invalid veil-scope tag')
    return null
  }
  if (value.length > MAX_SCOPE_LENGTH) {
    errors.push(`veil-scope exceeds maximum length (${MAX_SCOPE_LENGTH})`)
    return null
  }
  if (!SCOPE_RE.test(value)) {
    errors.push('veil-scope is not a valid scope slug')
    return null
  }
  return value
}

function parseDecimalInteger(value: string | undefined): number | undefined {
  if (value === undefined || !DECIMAL_INTEGER_RE.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertSubjectTag(value: string): asserts value is SubjectTag {
  if (value !== 'p' && value !== 'e' && value !== 'a' && value !== 'k') {
    throw new Error(`signed message subjectTag is not supported: ${value}`)
  }
}

function parseMetrics(rawMetrics: Record<string, unknown>, limits: VerifyLimits): Record<string, number> {
  const entries = Object.entries(rawMetrics)
  if (entries.length > limits.maxMetricCount) {
    throw new Error(`signed message exceeds maximum metric count (${limits.maxMetricCount})`)
  }

  const metrics: Record<string, number> = {}
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > limits.maxMetricNameLength) {
      throw new Error(`signed metric name exceeds maximum length (${limits.maxMetricNameLength})`)
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`signed metric "${key}" is not a finite number`)
    }
    metrics[key] = value
  }
  return metrics
}

function parseSignedMessage(message: string, limits: VerifyLimits): SignedMessage {
  if (message.length > limits.maxSignedMessageBytes) {
    throw new Error(`signed message exceeds maximum size (${limits.maxSignedMessageBytes})`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(message)
  } catch {
    throw new Error('signed message is not valid JSON')
  }

  if (!isRecord(parsed)) {
    throw new Error('signed message must be a JSON object')
  }

  const { circleId, subject, metrics: rawMetrics } = parsed
  if (typeof circleId !== 'string' || typeof subject !== 'string' || !isRecord(rawMetrics)) {
    throw new Error('signed message has invalid shape')
  }

  const metrics = parseMetrics(rawMetrics, limits)

  if (parsed.proofVersion === 'v2') {
    const rawKind = parsed.kind
    const rawSubjectTag = parsed.subjectTag
    const rawSubjectTagValue = parsed.subjectTagValue
    if (typeof rawKind !== 'number' || !Number.isSafeInteger(rawKind) || rawKind < 0) {
      throw new Error('signed message kind is invalid')
    }
    if (typeof rawSubjectTag !== 'string') {
      throw new Error('signed message subjectTag is invalid')
    }
    assertSubjectTag(rawSubjectTag)
    if (typeof rawSubjectTagValue !== 'string' || rawSubjectTagValue === '') {
      throw new Error('signed message subjectTagValue is invalid')
    }

    const context = { kind: rawKind, subjectTag: rawSubjectTag, subjectTagValue: rawSubjectTagValue }
    if (message !== canonicalMessageV2(circleId, subject, metrics, context)) {
      throw new Error('signed message is not canonical')
    }

    return {
      circleId,
      kind: rawKind,
      metrics,
      proofVersion: 'v2',
      subject,
      subjectTag: rawSubjectTag,
      subjectTagValue: rawSubjectTagValue,
    }
  }

  if (parsed.proofVersion !== undefined) {
    throw new Error('signed message proof version is unsupported')
  }

  if (message !== canonicalMessage(circleId, subject, metrics)) {
    throw new Error('signed message is not canonical')
  }

  return { circleId, subject, metrics }
}

function extractPublishedMetrics(tags: string[][]): { metrics: Record<string, string>; errors: string[] } {
  const metrics: Record<string, string> = {}
  const errors: string[] = []

  for (const tag of tags) {
    const name = tag[0]
    if (META_TAGS.has(name) || name.startsWith('veil-')) continue
    if (tag[1] === undefined) {
      errors.push(`Metric "${name}" is missing a value`)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(metrics, name)) {
      errors.push(`Duplicate metric tag "${name}"`)
      continue
    }
    metrics[name] = tag[1]
  }

  return { metrics, errors }
}

function aggregateSignedMetrics(
  messages: SignedMessage[],
  aggregateFn: AggregateFn,
  errors: string[],
): Record<string, number> {
  const allMetricKeys = new Set<string>()
  for (const message of messages) {
    for (const key of Object.keys(message.metrics)) allMetricKeys.add(key)
  }

  const aggregatedMetrics: Record<string, number> = {}
  for (const key of allMetricKeys) {
    const values = messages.map(message => message.metrics[key]).filter((v): v is number => v !== undefined)
    const aggregated = aggregateFn(values)
    if (!Number.isFinite(aggregated)) {
      errors.push(`aggregateFn returned non-finite value for metric "${key}": ${aggregated}`)
      continue
    }
    aggregatedMetrics[key] = aggregated
  }
  return aggregatedMetrics
}

function comparePublishedMetrics(
  publishedMetrics: Record<string, string>,
  signedMetrics: Record<string, number>,
  errors: string[],
): void {
  for (const [key, value] of Object.entries(signedMetrics)) {
    const published = publishedMetrics[key]
    if (published === undefined) {
      errors.push(`Missing metric "${key}" derived from signed contributions`)
      continue
    }
    if (published !== String(value)) {
      errors.push(`Published metric "${key}" (${published}) does not match signed contributions (${value})`)
    }
  }

  for (const key of Object.keys(publishedMetrics)) {
    if (!Object.prototype.hasOwnProperty.call(signedMetrics, key)) {
      errors.push(`Published metric "${key}" is not signed by any contribution`)
    }
  }
}

interface ParsedSignature {
  fullSig: {
    c0: string
    electionId: string
    keyImage: string
    message: string
    responses: string[]
    ring: string[]
    domain?: string
  }
  keyImage: string
}

function parseSignatureTag(
  tag: string[],
  ring: string[],
  index: number,
  limits: VerifyLimits,
  errors: string[],
): ParsedSignature | null {
  const payload = tag[1]
  if (typeof payload !== 'string') {
    errors.push(`Signature at index ${index} missing signature payload`)
    return null
  }
  if (payload.length > limits.maxSigPayloadBytes) {
    errors.push(`Signature at index ${index} signature payload exceeds maximum size (${limits.maxSigPayloadBytes})`)
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    errors.push(`Signature at index ${index} signature payload is not valid JSON`)
    return null
  }
  if (!isRecord(parsed)) {
    errors.push(`Signature at index ${index} signature payload must be a JSON object`)
    return null
  }

  const keyImage = tag[2]
  if (typeof keyImage !== 'string' || !KEY_IMAGE_RE.test(keyImage)) {
    errors.push(`Signature at index ${index} key image is invalid`)
    return null
  }

  const { c0, electionId: eid, message, responses, domain } = parsed
  if (typeof c0 !== 'string' || !HEX64_RE.test(c0)) {
    errors.push(`Signature at index ${index} c0 is invalid`)
    return null
  }
  if (typeof eid !== 'string' || eid === '') {
    errors.push(`Signature at index ${index} missing electionId`)
    return null
  }
  if (typeof message !== 'string') {
    errors.push(`Signature at index ${index} missing signed message`)
    return null
  }
  if (message.length > limits.maxSignedMessageBytes) {
    errors.push(`Signature at index ${index} signed message exceeds maximum size (${limits.maxSignedMessageBytes})`)
    return null
  }
  if (!Array.isArray(responses) || responses.length !== ring.length) {
    errors.push(`Signature at index ${index} response count does not match veil-ring size`)
    return null
  }
  for (let responseIndex = 0; responseIndex < responses.length; responseIndex++) {
    if (typeof responses[responseIndex] !== 'string' || !HEX64_RE.test(responses[responseIndex])) {
      errors.push(`Signature at index ${index} response ${responseIndex} is invalid`)
      return null
    }
  }
  if (domain !== undefined && typeof domain !== 'string') {
    errors.push(`Signature at index ${index} domain is invalid`)
    return null
  }

  return {
    fullSig: {
      c0,
      electionId: eid,
      keyImage,
      message,
      responses,
      ring,
      ...(domain === undefined ? {} : { domain }),
    },
    keyImage,
  }
}

function declaredProofVersion(tags: string[][], errors: string[]): ProofVersion | undefined {
  const versionTags = tags.filter(t => t[0] === 'veil-version')
  if (versionTags.length > 1) {
    errors.push('Multiple veil-version tags')
    return undefined
  }
  if (versionTags.length === 0) return undefined
  if (versionTags[0][1] !== '2') {
    errors.push(`Unknown veil-version: ${versionTags[0][1]}`)
    return undefined
  }
  return 'v2'
}

function proofVersionOf(message: SignedMessage): ProofVersion {
  return message.proofVersion ?? 'v1'
}

function expectedElectionId(
  scope: string,
  subject: string,
  message: SignedMessage,
): string {
  if (message.proofVersion !== 'v2') {
    return electionId(scope, subject)
  }
  const context: Required<Pick<ProofContext, 'kind' | 'subjectTag' | 'subjectTagValue'>> = {
    kind: message.kind,
    subjectTag: message.subjectTag,
    subjectTagValue: message.subjectTagValue,
  }
  return electionIdV2(scope, subject, context)
}

function subjectTagValue(tags: string[][], name: SubjectTag): string | undefined {
  const values = tags.filter(t => t[0] === name).map(t => t[1]).filter((v): v is string => typeof v === 'string')
  if (values.length !== 1) return undefined
  return values[0]
}

function validateV2EventBinding(
  event: { kind: number; tags: string[][] },
  subject: string,
  message: SignedMessageV2,
  index: number,
  errors: string[],
): boolean {
  let valid = true
  if (message.kind !== event.kind) {
    errors.push(`Signature at index ${index} signed message kind mismatch`)
    valid = false
  }

  const tagValue = subjectTagValue(event.tags, message.subjectTag)
  if (tagValue === undefined) {
    errors.push(`Signature at index ${index} bound subject tag ${message.subjectTag} missing or duplicated`)
    valid = false
  } else if (tagValue !== message.subjectTagValue) {
    errors.push(`Signature at index ${index} bound subject tag ${message.subjectTag} mismatch`)
    valid = false
  }

  if (message.subjectTag !== 'k' && message.subjectTagValue !== subject) {
    errors.push(`Signature at index ${index} bound subject tag value does not match d-tag`)
    valid = false
  }

  return valid
}

export function verifyProof(event: {
  kind: number
  tags: string[][]
  content: string
}, options?: VerifyOptions): ProofVerification {
  const errors: string[] = []
  const limits = limitsFromOptions(options)
  const requiredVersion = requiredProofVersion(options)

  // Require d tag -- without it the electionId check cannot bind signatures to a subject
  const dTag = event.tags.find(t => t[0] === 'd')
  if (!dTag) {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Missing d tag'] }
  }
  if (typeof dTag[1] !== 'string' || dTag[1] === '') {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Invalid d tag'] }
  }
  const subject = dTag[1]

  const ringTag = event.tags.find(t => t[0] === 'veil-ring')
  if (!ringTag) {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Missing veil-ring tag'] }
  }
  const ring = ringTag.slice(1)

  if (ring.length < 2) {
    return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: ['veil-ring requires at least 2 members'] }
  }

  // Guard against relay-supplied DoS: unbounded ring inflates memory + verification time
  if (ring.length > limits.maxRingSize) {
    return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: [`veil-ring exceeds maximum size (${limits.maxRingSize})`] }
  }

  // Validate ring members are valid hex pubkeys in sorted order
  for (let i = 0; i < ring.length; i++) {
    if (!HEX64_RE.test(ring[i])) {
      return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: [`Invalid pubkey format in veil-ring at index ${i}`] }
    }
    if (i > 0 && ring[i] <= ring[i - 1]) {
      return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: ['veil-ring pubkeys are not in sorted order'] }
    }
  }

  // Require veil-threshold tag
  const thresholdTag = event.tags.find(t => t[0] === 'veil-threshold')
  if (!thresholdTag) {
    return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: ['Missing veil-threshold tag'] }
  }
  const threshold = parseDecimalInteger(thresholdTag[1])
  const declaredCircleSize = parseDecimalInteger(thresholdTag[2])
  const circleSize = ring.length

  // Validate threshold is a sane integer
  if (threshold === undefined || threshold < 1 || threshold > ring.length) {
    errors.push(`Invalid threshold: ${thresholdTag[1]}`)
    return { valid: false, circleSize, threshold: 0, distinctSigners: 0, errors }
  }
  if (declaredCircleSize !== circleSize) {
    errors.push(`veil-threshold circle size ${thresholdTag[2]} does not match veil-ring size ${circleSize}`)
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }

  const sigTags = event.tags.filter(t => t[0] === 'veil-sig')
  if (sigTags.length === 0) {
    errors.push('No veil-sig tags found')
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }

  // Cap sig tags at ring size -- legitimate events cannot have more sigs than members
  if (sigTags.length > ring.length) {
    errors.push(`Too many veil-sig tags (${sigTags.length}) for ring of size ${ring.length}`)
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }

  // Circle ID is derived from the already-validated sorted ring
  const expectedCircleId = computeCircleId(ring)
  // Scope comes from the veil-scope tag, or defaults to the circleId
  const scope = resolveScope(event.tags, expectedCircleId, errors)
  if (scope === null) {
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }
  const declaredVersion = declaredProofVersion(event.tags, errors)
  if (errors.length > 0) {
    return { valid: false, circleSize, threshold, distinctSigners: 0, errors }
  }

  const keyImages: string[] = []
  const signedMessages: SignedMessage[] = []
  let validSigs = 0

  for (let i = 0; i < sigTags.length; i++) {
    const parsedSig = parseSignatureTag(sigTags[i], ring, i, limits, errors)
    if (parsedSig === null) continue

    let signedMessage: SignedMessage
    try {
      signedMessage = parseSignedMessage(parsedSig.fullSig.message, limits)
    } catch (e) {
      errors.push(`Signature at index ${i} ${(e as Error).message}`)
      continue
    }

    const messageVersion = proofVersionOf(signedMessage)
    if (requiredVersion !== undefined && messageVersion !== requiredVersion) {
      errors.push(`Signature at index ${i} proof version mismatch: expected ${requiredVersion}`)
      continue
    }
    if (declaredVersion !== undefined && messageVersion !== declaredVersion) {
      errors.push(`Signature at index ${i} proof version does not match veil-version tag`)
      continue
    }

    // Bind the signature to this event's subject and semantic context. v1 keeps
    // the historical electionId, while v2 also binds kind and subject hint tag.
    const expectedEid = expectedElectionId(scope, subject, signedMessage)
    if (parsedSig.fullSig.electionId !== expectedEid) {
      errors.push(`Signature at index ${i} electionId mismatch`)
      continue
    }
    if (signedMessage.circleId !== expectedCircleId) {
      errors.push(`Signature at index ${i} signed message circleId mismatch`)
      continue
    }
    if (signedMessage.subject !== subject) {
      errors.push(`Signature at index ${i} signed message subject mismatch`)
      continue
    }
    if (signedMessage.proofVersion === 'v2' && !validateV2EventBinding(event, subject, signedMessage, i, errors)) {
      continue
    }

    if (!lsagVerify(parsedSig.fullSig)) {
      errors.push(`Invalid LSAG signature at index ${i}`)
      continue
    }

    if (hasDuplicateKeyImage(parsedSig.keyImage, keyImages)) {
      errors.push(`Duplicate key image at index ${i}`)
      continue
    }

    keyImages.push(parsedSig.keyImage)
    signedMessages.push(signedMessage)
    validSigs++
  }

  if (validSigs !== threshold) {
    errors.push(`veil-threshold signer count ${threshold} does not match ${validSigs} valid signatures`)
  }

  if (errors.length === 0) {
    const aggregateFn = resolveAggregateFn(event.tags, options, errors)
    if (aggregateFn !== null) {
      const published = extractPublishedMetrics(event.tags)
      errors.push(...published.errors)
      const signedMetrics = aggregateSignedMetrics(signedMessages, aggregateFn, errors)
      comparePublishedMetrics(published.metrics, signedMetrics, errors)
    }
  }

  return {
    valid: errors.length === 0 && validSigs === threshold,
    circleSize,
    threshold,
    distinctSigners: validSigs,
    errors,
  }
}
