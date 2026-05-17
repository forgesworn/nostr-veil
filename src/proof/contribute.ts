import { lsagSign } from '@forgesworn/ring-sig'
import { NIP85_KINDS } from '../nip85/types.js'
import type { Contribution, ProofContext, ProofVersion, TrustCircle } from './types.js'
import { canonicalMessage, canonicalMessageV2, electionId, electionIdV2 } from './circle.js'

export type ContributionOptions = ProofContext
export type TypedContributionOptions = { proofVersion?: ProofVersion }

function v2Context(
  subject: string,
  options: ContributionOptions | undefined,
): Required<Pick<ProofContext, 'kind' | 'subjectTag' | 'subjectTagValue'>> {
  return {
    kind: options?.kind ?? NIP85_KINDS.USER,
    subjectTag: options?.subjectTag ?? 'p',
    subjectTagValue: options?.subjectTagValue ?? subject,
  }
}

function typedOptions(
  options: TypedContributionOptions | undefined,
  kind: number,
  subjectTag: Required<ProofContext>['subjectTag'],
  subjectTagValue: string,
): ContributionOptions | undefined {
  if (options?.proofVersion !== 'v2') return options
  return {
    proofVersion: 'v2',
    kind,
    subjectTag,
    subjectTagValue,
  }
}

/**
 * Produce an anonymous contribution to a trust circle assertion.
 *
 * Signs the canonical message with an LSAG ring signature so the contributor's
 * identity is hidden within the ring. The key image prevents double-signing; if
 * the circle has a `scope`, that key image is shared across every circle using
 * the same scope, which is what enables cross-circle deduplication.
 *
 * @param circle - Trust circle created via {@link createTrustCircle}
 * @param subject - The d-tag value (hex pubkey for kind 30382)
 * @param metrics - Metric key-value pairs (e.g. `{ rank: 85, followers: 1200 }`)
 * @param privateKey - 32-byte hex private key of the contributing member
 * @param memberIndex - 0-based index of this member in `circle.members` (sorted order)
 * @returns A {@link Contribution} containing the LSAG signature, key image, and metrics
 * @throws If `memberIndex` is out of range or the private key doesn't match the pubkey at that index
 */
export function contributeAssertion(
  circle: TrustCircle,
  subject: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number,
  options?: ContributionOptions,
): Contribution {
  const proofVersion = options?.proofVersion ?? 'v1'
  const context = proofVersion === 'v2' ? v2Context(subject, options) : undefined
  const message = context === undefined
    ? canonicalMessage(circle.circleId, subject, metrics)
    : canonicalMessageV2(circle.circleId, subject, metrics, context)
  const scope = circle.scope ?? circle.circleId
  const eid = context === undefined
    ? electionId(scope, subject)
    : electionIdV2(scope, subject, context)

  const signature = lsagSign(message, circle.members, memberIndex, privateKey, eid)

  return {
    signature,
    keyImage: signature.keyImage,
    metrics: { ...metrics },
  }
}

/** Produce an anonymous contribution for a kind 30383 event assertion. */
export function contributeEventAssertion(
  circle: TrustCircle,
  eventId: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number,
  options?: TypedContributionOptions,
): Contribution {
  return contributeAssertion(
    circle,
    eventId,
    metrics,
    privateKey,
    memberIndex,
    typedOptions(options, NIP85_KINDS.EVENT, 'e', eventId),
  )
}

/** Produce an anonymous contribution for a kind 30384 addressable event assertion. */
export function contributeAddressableAssertion(
  circle: TrustCircle,
  address: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number,
  options?: TypedContributionOptions,
): Contribution {
  return contributeAssertion(
    circle,
    address,
    metrics,
    privateKey,
    memberIndex,
    typedOptions(options, NIP85_KINDS.ADDRESSABLE, 'a', address),
  )
}

/** Produce an anonymous contribution for a kind 30385 identifier assertion. */
export function contributeIdentifierAssertion(
  circle: TrustCircle,
  identifier: string,
  kTag: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number,
  options?: TypedContributionOptions,
): Contribution {
  return contributeAssertion(
    circle,
    identifier,
    metrics,
    privateKey,
    memberIndex,
    typedOptions(options, NIP85_KINDS.IDENTIFIER, 'k', kTag),
  )
}
