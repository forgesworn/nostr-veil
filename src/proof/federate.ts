import { computeCircleId } from './circle.js'
import { verifyProof } from './verify.js'
import type { VerifyOptions } from './verify.js'
import type { FederationVerification } from './types.js'

/** A Nostr event, or unsigned template, carrying Veil proof tags. */
type ProofEvent = { kind: number; tags: string[][]; content: string }

/** One verified, federation-scoped event reduced to what deduplication needs. */
interface ScopedEvent {
  kind: number
  subject: string
  scope: string
  circleId: string
  electionIds: string[]
  keyImages: string[]
}

/**
 * Verify a federation of Veil-enhanced NIP-85 events: several assertions about
 * the same subject, produced by different trust circles that share a federation
 * `scope`.
 *
 * Each event is verified independently with {@link verifyProof}. A shared scope
 * makes one contributor's LSAG key image identical in every circle they belong
 * to, so counting the distinct key images across all events counts the distinct
 * contributors -- a member of several circles is counted once, not once per
 * circle.
 *
 * The federation is valid only when every event verifies, every event carries a
 * `veil-scope` tag, and all events agree on kind, subject and scope and were
 * signed under one electionId (the same proof version and, for v2, the same
 * bound subject tag and value), so their key images are comparable. An event
 * with no `veil-scope` tag is circle-scoped: its key images are not comparable
 * across circles, so it cannot take part in a federation.
 *
 * `verifyFederation` runs {@link verifyProof} on every event, so cost grows with
 * the event count and with each circle's ring size. A very large federation is
 * best verified in batches rather than in a single call.
 *
 * @param events - Aggregated Veil events ({@link aggregateContributions} output), signed or not
 * @param options - Forwarded to every {@link verifyProof} call: an aggregate function (needed only for events whose `veil-agg` tag is `custom`), or options such as `expectedKind`, which v1 proofs need since their signatures are not bound to the kind, and `rejectSubjectInRing`, which fails the federation when the subject is a member of any event's ring
 * @returns A {@link FederationVerification}; its counts are meaningful only when `valid` is true
 *
 * @example
 * const result = verifyFederation([circleAEvent, circleBEvent])
 * if (result.valid) {
 *   // distinct people, without double-counting anyone in both circles
 *   console.log(`${result.distinctSigners} of ${result.totalSignatures} signatures are distinct`)
 * }
 */
export function verifyFederation(
  events: ProofEvent[],
  options?: VerifyOptions,
): FederationVerification {
  const errors: string[] = []

  if (!Array.isArray(events) || events.length === 0) {
    return {
      valid: false,
      subject: null,
      scope: null,
      circleCount: 0,
      totalSignatures: 0,
      distinctSigners: 0,
      subjectInRing: false,
      independentSigners: 0,
      errors: ['Federation requires at least one event'],
    }
  }

  const scopedEvents: ScopedEvent[] = []
  let anySubjectInRing = false
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const proof = verifyProof(event, options)
    // Carry the flag even from an event that fails, so a failed federation still reports it
    if (proof.subjectInRing) anySubjectInRing = true
    if (!proof.valid) {
      for (const error of proof.errors) errors.push(`event[${i}]: ${error}`)
      continue
    }

    // verifyProof succeeded, so the d, veil-ring and veil-sig tags are present
    // and well-formed; the lookups below also narrow types for the compiler.
    const subject = event.tags.find(t => t[0] === 'd')?.[1]
    const ringTag = event.tags.find(t => t[0] === 'veil-ring')
    if (subject === undefined || ringTag === undefined) continue

    const scope = event.tags.find(t => t[0] === 'veil-scope')?.[1]
    if (scope === undefined) {
      errors.push(`event[${i}]: not federation-scoped -- an event with no veil-scope tag cannot be deduplicated across circles`)
      continue
    }

    scopedEvents.push({
      kind: event.kind,
      subject,
      scope,
      circleId: computeCircleId(ringTag.slice(1)),
      // verifyProof has parsed every payload, so this cannot throw
      electionIds: event.tags.filter(t => t[0] === 'veil-sig').map(t => (JSON.parse(t[1]) as { electionId: string }).electionId),
      keyImages: event.tags.filter(t => t[0] === 'veil-sig').map(t => t[2]),
    })
  }

  const subjects = new Set(scopedEvents.map(e => e.subject))
  const scopes = new Set(scopedEvents.map(e => e.scope))
  if (new Set(scopedEvents.map(e => e.kind)).size > 1) errors.push('Federation events are of different kinds')
  if (subjects.size > 1) errors.push('Federation events are about different subjects')
  if (scopes.size > 1) errors.push('Federation events use different scopes')
  // A key image depends on the signer and the electionId. v2 folds the kind,
  // the bound subject tag and its value into the electionId, so events that
  // agree on subject and scope can still yield different key images for one
  // signer. Only events signed under a single electionId can be deduplicated.
  if (new Set(scopedEvents.flatMap(e => e.electionIds)).size > 1) {
    errors.push('Federation events are signed under different election ids (proof version, bound subject tag or k value differ), so their key images cannot be compared')
  }

  const circleIds = new Set<string>()
  const distinctKeyImages = new Set<string>()
  let totalSignatures = 0
  for (const event of scopedEvents) {
    circleIds.add(event.circleId)
    totalSignatures += event.keyImages.length
    for (const keyImage of event.keyImages) distinctKeyImages.add(keyImage)
  }

  return {
    valid: errors.length === 0,
    subject: subjects.size === 1 ? [...subjects][0] : null,
    scope: scopes.size === 1 ? [...scopes][0] : null,
    circleCount: circleIds.size,
    totalSignatures,
    distinctSigners: distinctKeyImages.size,
    subjectInRing: anySubjectInRing,
    // Events share one scope, so the subject holds at most one key image across the federation
    independentSigners: anySubjectInRing ? Math.max(0, distinctKeyImages.size - 1) : distinctKeyImages.size,
    errors,
  }
}
