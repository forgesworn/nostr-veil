import { lsagVerify, hasDuplicateKeyImage } from '@forgesworn/ring-sig'
import { canonicalMessage, computeCircleId } from './circle.js'
import type { AggregateFn, ProofVerification } from './types.js'
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
const MAX_RING_SIZE = 1000
const HEX64_RE = /^[0-9a-f]{64}$/
const DECIMAL_INTEGER_RE = /^(0|[1-9]\d*)$/
const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

type VerifyOptions = AggregateFn | { aggregateFn?: AggregateFn }

interface SignedMessage {
  circleId: string
  subject: string
  metrics: Record<string, number>
}

function aggregateFnFromOptions(options?: VerifyOptions): AggregateFn {
  return typeof options === 'function'
    ? options
    : options?.aggregateFn ?? AGGREGATES.median
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

function parseDecimalInteger(value: string | undefined): number | undefined {
  if (value === undefined || !DECIMAL_INTEGER_RE.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSignedMessage(message: string): SignedMessage {
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

  const metrics: Record<string, number> = {}
  for (const [key, value] of Object.entries(rawMetrics)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`signed metric "${key}" is not a finite number`)
    }
    metrics[key] = value
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

export function verifyProof(event: {
  kind: number
  tags: string[][]
  content: string
}, options?: VerifyOptions): ProofVerification {
  const errors: string[] = []

  // Require d tag -- without it the electionId check cannot bind signatures to a subject
  const dTag = event.tags.find(t => t[0] === 'd')
  if (!dTag) {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Missing d tag'] }
  }
  if (typeof dTag[1] !== 'string' || dTag[1] === '') {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Invalid d tag'] }
  }

  const ringTag = event.tags.find(t => t[0] === 'veil-ring')
  if (!ringTag) {
    return { valid: false, circleSize: 0, threshold: 0, distinctSigners: 0, errors: ['Missing veil-ring tag'] }
  }
  const ring = ringTag.slice(1)

  if (ring.length < 2) {
    return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: ['veil-ring requires at least 2 members'] }
  }

  // Guard against relay-supplied DoS: unbounded ring inflates memory + verification time
  if (ring.length > MAX_RING_SIZE) {
    return { valid: false, circleSize: ring.length, threshold: 0, distinctSigners: 0, errors: [`veil-ring exceeds maximum size (${MAX_RING_SIZE})`] }
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
  const expectedElectionId = `veil:v1:${expectedCircleId}:${dTag[1]}`

  const keyImages: string[] = []
  const signedMessages: SignedMessage[] = []
  let validSigs = 0

  for (let i = 0; i < sigTags.length; i++) {
    try {
      const sigData = JSON.parse(sigTags[i][1])
      const keyImage = sigTags[i][2]
      const fullSig = { ...sigData, keyImage, ring }

      if (!lsagVerify(fullSig)) {
        errors.push(`Invalid LSAG signature at index ${i}`)
        continue
      }

      // Bind the signature to this event's subject: the electionId must match
      // the pattern veil:v1:<circleId>:<subject> derived from the ring and d-tag.
      // Without this check, valid signatures could be transplanted between events.
      // Missing electionId is treated as failure -- stripping it is the simplest bypass.
      if (typeof sigData.electionId !== 'string') {
        errors.push(`Signature at index ${i} missing electionId`)
        continue
      }
      if (sigData.electionId !== expectedElectionId) {
        errors.push(`Signature at index ${i} electionId mismatch`)
        continue
      }
      if (typeof sigData.message !== 'string') {
        errors.push(`Signature at index ${i} missing signed message`)
        continue
      }

      let signedMessage: SignedMessage
      try {
        signedMessage = parseSignedMessage(sigData.message)
      } catch (e) {
        errors.push(`Signature at index ${i} ${(e as Error).message}`)
        continue
      }
      if (signedMessage.circleId !== expectedCircleId) {
        errors.push(`Signature at index ${i} signed message circleId mismatch`)
        continue
      }
      if (signedMessage.subject !== dTag[1]) {
        errors.push(`Signature at index ${i} signed message subject mismatch`)
        continue
      }

      if (hasDuplicateKeyImage(keyImage, keyImages)) {
        errors.push(`Duplicate key image at index ${i}`)
        continue
      }

      keyImages.push(keyImage)
      signedMessages.push(signedMessage)
      validSigs++
    } catch (e) {
      errors.push(`Failed to process signature at index ${i}`)
    }
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
