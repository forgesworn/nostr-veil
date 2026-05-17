import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { ProofContext, SubjectTag, TrustCircle } from './types.js'

/** Maximum length of a federation scope string (and of a `veil-scope` tag value). */
export const MAX_SCOPE_LENGTH = 128

/**
 * A valid federation scope: a non-empty lowercase slug. Enforced on both the
 * build side ({@link createTrustCircle}) and the verify side, so a mistyped
 * scope fails loudly instead of silently breaking cross-circle deduplication.
 */
export const SCOPE_RE = /^[a-z0-9._-]+$/

/**
 * Compute a deterministic circle ID by SHA-256 hashing the colon-joined sorted pubkeys.
 *
 * @param sortedPubkeys - Array of hex pubkeys already in sorted (lexicographic) order
 * @returns A 64-char hex SHA-256 digest that uniquely identifies this exact group membership
 *
 * @example
 * const id = computeCircleId([alicePubkey, bobPubkey].sort())
 * // '3f4a2b…' (64-char hex string)
 */
export function computeCircleId(sortedPubkeys: string[]): string {
  const input = sortedPubkeys.join(':')
  return bytesToHex(sha256(new TextEncoder().encode(input)))
}

/**
 * Build the LSAG electionId that scopes a contributor's key image.
 *
 * An LSAG key image `I = x * H_p(P || electionId)` is identical for a given
 * signer wherever the electionId matches. Passing a circle's `circleId` (the
 * default) isolates every circle: the same person yields an unrelated key image
 * in each. Passing a shared federation `scope` instead lets a set of circles
 * recognise a contributor who appears in several of them, which is what makes
 * cross-circle deduplication possible.
 *
 * @param scope - A circle's `scope` if it has one, otherwise its `circleId`
 * @param subject - The d-tag value the contribution is about
 * @returns The versioned electionId string `veil:v1:<scope>:<subject>`
 */
export function electionId(scope: string, subject: string): string {
  return `veil:v1:${scope}:${subject}`
}

/**
 * Build the v2 LSAG electionId. v2 scopes the key image to the assertion kind
 * and subject hint tag as well as the d-tag subject, preventing cross-kind or
 * cross-tag replay without changing the v1 default.
 */
export function electionIdV2(
  scope: string,
  subject: string,
  context: Required<Pick<ProofContext, 'kind' | 'subjectTag' | 'subjectTagValue'>>
): string {
  return `veil:v2:${scope}:${context.kind}:${context.subjectTag}:${context.subjectTagValue}:${subject}`
}

function assertFiniteMetrics(metrics: Record<string, number>): void {
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) {
      throw new Error(`Metric "${key}" must be a finite number, got ${value}`)
    }
  }
}

function sortedMetrics(metrics: Record<string, number>): Record<string, number> {
  assertFiniteMetrics(metrics)
  const sorted: Record<string, number> = {}
  for (const key of Object.keys(metrics).sort()) {
    sorted[key] = metrics[key]
  }
  return sorted
}

function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(value, (_key: string, child: unknown) => {
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(child as Record<string, unknown>).sort()) {
        sorted[k] = (child as Record<string, unknown>)[k]
      }
      return sorted
    }
    return child
  })
}

function assertSubjectTag(value: string): asserts value is SubjectTag {
  if (value !== 'p' && value !== 'e' && value !== 'a' && value !== 'k') {
    throw new Error(`Invalid subject tag: ${value}`)
  }
}

/**
 * Produce the canonical JSON message that contributors sign with LSAG.
 *
 * All object keys (top-level and within metrics) are explicitly sorted to
 * guarantee deterministic output regardless of property insertion order.
 * Metric values must be finite numbers — NaN/Infinity would serialise as
 * `null`, breaking cross-platform determinism.
 *
 * @param circleId - The circle's deterministic ID from {@link computeCircleId}
 * @param subject - The d-tag value (hex pubkey for kind 30382, event ID for kind 30383, etc.)
 * @param metrics - Key-value pairs of metric names to finite numeric values
 * @returns A deterministic JSON string suitable for LSAG signing
 *
 * @throws If any metric value is NaN or non-finite (Infinity / -Infinity)
 *
 * @example
 * const msg = canonicalMessage(circle.circleId, subjectPubkey, { rank: 85, followers: 1200 })
 * // '{"circleId":"…","metrics":{"followers":1200,"rank":85},"subject":"…"}'
 */
export function canonicalMessage(
  circleId: string,
  subject: string,
  metrics: Record<string, number>
): string {
  // Top-level keys are explicitly alphabetical: circleId < metrics < subject.
  // Using a replacer function to sort keys at every nesting level, ensuring
  // deterministic output independent of object literal insertion order.
  const obj = { circleId, metrics: sortedMetrics(metrics), subject }
  return stableStringify(obj)
}

/**
 * Produce the canonical JSON message for opt-in proof v2.
 *
 * v2 adds semantic context to the signed message: the NIP-85 kind and the
 * subject hint tag/value (`p`, `e`, `a`, or `k`). That makes the contribution
 * non-transferable across assertion classes even when the same d-tag value is
 * reused.
 */
export function canonicalMessageV2(
  circleId: string,
  subject: string,
  metrics: Record<string, number>,
  context: Required<Pick<ProofContext, 'kind' | 'subjectTag' | 'subjectTagValue'>>
): string {
  if (!Number.isSafeInteger(context.kind) || context.kind < 0) {
    throw new Error('v2 proof kind must be a non-negative safe integer')
  }
  assertSubjectTag(context.subjectTag)
  if (typeof context.subjectTagValue !== 'string' || context.subjectTagValue === '') {
    throw new Error('v2 proof subjectTagValue must be a non-empty string')
  }
  const obj = {
    circleId,
    kind: context.kind,
    metrics: sortedMetrics(metrics),
    proofVersion: 'v2',
    subject,
    subjectTag: context.subjectTag,
    subjectTagValue: context.subjectTagValue,
  }
  return stableStringify(obj)
}

/**
 * Create a trust circle from an array of hex pubkeys. Requires at least 2 unique members.
 *
 * The input array is sorted internally — the caller need not pre-sort. Each pubkey must
 * appear exactly once; duplicates cause an immediate throw.
 *
 * @param memberPubkeys - Array of hex-encoded x-only public keys (64 chars each)
 * @param options - Optional configuration
 * @param options.scope - Federation scope for cross-circle deduplication. When set,
 *   every contribution's LSAG key image is scoped to this string rather than the
 *   `circleId`, so the same member yields a matching key image in any circle that
 *   shares the scope. Must be a lowercase slug ({@link SCOPE_RE}). Omit for the
 *   default per-circle isolation.
 * @returns A {@link TrustCircle} with a stable `members` order and a deterministic `circleId`
 *
 * @throws If fewer than 2 pubkeys are supplied
 * @throws If any pubkey appears more than once in the array
 * @throws If `scope` is empty, longer than {@link MAX_SCOPE_LENGTH}, or not a lowercase slug
 *
 * @example
 * const circle = createTrustCircle([alicePubkey, bobPubkey, carolPubkey])
 * // { members: ['alice…', 'bob…', 'carol…'], circleId: '3f4a…', size: 3 }
 *
 * @example
 * // Two circles whose shared contributors can be deduplicated:
 * const a = createTrustCircle(membersA, { scope: 'community-moderators' })
 * const b = createTrustCircle(membersB, { scope: 'community-moderators' })
 */
export function createTrustCircle(
  memberPubkeys: string[],
  options?: { scope?: string }
): TrustCircle {
  if (memberPubkeys.length < 2) {
    throw new Error('Trust circle requires at least 2 members')
  }
  const HEX64_RE = /^[0-9a-f]{64}$/
  const sorted = [...memberPubkeys].sort()
  const seen = new Set<string>()
  for (const pk of sorted) {
    if (!HEX64_RE.test(pk)) throw new Error(`Invalid pubkey format: expected 64-char lowercase hex`)
    if (seen.has(pk)) throw new Error(`Duplicate pubkey in trust circle: ${pk}`)
    seen.add(pk)
  }
  const circle: TrustCircle = {
    members: sorted,
    circleId: computeCircleId(sorted),
    size: sorted.length,
  }
  if (options?.scope !== undefined) {
    if (typeof options.scope !== 'string' || options.scope.length === 0) {
      throw new Error('Trust circle scope must be a non-empty string')
    }
    if (options.scope.length > MAX_SCOPE_LENGTH) {
      throw new Error(`Trust circle scope exceeds maximum length (${MAX_SCOPE_LENGTH})`)
    }
    if (!SCOPE_RE.test(options.scope)) {
      throw new Error('Trust circle scope must be a lowercase slug (a-z, 0-9, dot, hyphen, underscore)')
    }
    circle.scope = options.scope
  }
  return circle
}
