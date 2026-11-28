import { lsagSign, lsagVerify, MAX_RING_SIZE, ValidationError } from '@forgesworn/ring-sig'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { NIP85_KINDS } from '../nip85/types.js'
import type { Contribution, ProofContext, ProofVersion, TrustCircle } from './types.js'
import { canonicalMessage, canonicalMessageV2, electionId, electionIdV2 } from './circle.js'

export type ContributionOptions = ProofContext
export type TypedContributionOptions = { proofVersion?: ProofVersion }

/** What an external signer is asked to sign for one contribution. */
export interface LsagSignRequest {
  /**
   * The canonical message: JSON naming the circle, the subject and the metrics.
   * A signer can parse it to show the member what they are about to sign.
   */
  message: string
  /** The circle's members, in ring order. */
  ring: string[]
  /** The member's position in `ring`. */
  signerIndex: number
  /** The LSAG election id, which fixes the key image. */
  electionId: string
}

/**
 * Something that holds a member's private key and makes LSAG signatures with
 * it: a hardware device, a remote signer, another process. nostr-veil never
 * sees the key.
 */
export interface LsagSigner {
  lsagSign(request: LsagSignRequest): Promise<Contribution['signature']> | Contribution['signature']
}

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
  if (options?.proofVersion === 'v1') return options
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
 * @throws {ValidationError} If `metrics` is not an object, a function not being taken as one (`metrics must be an object`)
 * @throws {ValidationError} If the member at `memberIndex` is the `subject`. A circle member cannot contribute to an assertion about themselves. A modified client can still do it, so verifiers should read `subjectInRing` and `independentSigners` from {@link verifyProof}.
 */
export function contributeAssertion(
  circle: TrustCircle,
  subject: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number,
  options?: ContributionOptions,
): Contribution {
  const inputs = signingInputs(circle, subject, metrics, memberIndex, options)
  const signature = lsagSign(inputs.message, circle.members, memberIndex, privateKey, inputs.electionId)

  return {
    signature,
    keyImage: signature.keyImage,
    metrics: inputs.metrics,
  }
}

/** Whether a member is the subject. A pubkey is the same key in any case. */
function isSubject(member: unknown, subject: unknown): boolean {
  return typeof member === 'string' && typeof subject === 'string' && member.toLowerCase() === subject.toLowerCase()
}

/**
 * The message and election id a contribution is signed over, after the
 * self-assertion guard, and the metrics it holds. The metrics are read once,
 * into a copy that is both signed and kept, so a getter or a caller changing
 * its object cannot make what is kept differ from what was signed.
 */
function signingInputs(
  circle: TrustCircle,
  subject: string,
  metrics: Record<string, number>,
  memberIndex: number,
  options: ContributionOptions | undefined,
): { message: string; electionId: string; metrics: Record<string, number> } {
  if (isSubject(circle.members[memberIndex], subject)) {
    throw new ValidationError('A circle member cannot contribute to an assertion about themselves')
  }
  if (metrics === null || typeof metrics !== 'object') {
    throw new ValidationError('metrics must be an object')
  }
  const signed = { ...metrics }

  const proofVersion = options?.proofVersion ?? 'v1'
  const context = proofVersion === 'v2' ? v2Context(subject, options) : undefined
  const message = context === undefined
    ? canonicalMessage(circle.circleId, subject, signed)
    : canonicalMessageV2(circle.circleId, subject, signed, context)
  const scope = circle.scope ?? circle.circleId
  const eid = context === undefined
    ? electionId(scope, subject)
    : electionIdV2(scope, subject, context)

  return { message, electionId: eid, metrics: signed }
}

const HEX64_RE = /^[0-9a-f]{64}$/
const KEY_IMAGE_RE = /^[0-9a-f]{66}$/
/** The longest election id ring-sig signs or verifies, in UTF-8 bytes. It does not export it. */
const MAX_ELECTION_ID_BYTES = 512
/** The longest message ring-sig signs, in UTF-8 bytes. It does not export it either. */
const MAX_MESSAGE_BYTES = 65_536
/** ring-sig's own LSAG domain, which it leaves out of a signature made under it. */
const DEFAULT_LSAG_DOMAIN = 'lsag-v1'

const byteLength = (text: string): number => new TextEncoder().encode(text).length

/**
 * The ring an external signer is asked to sign over: the circle's members,
 * read once, by index, as a plain list of strings in lower case. None of the
 * list's own methods is called, so a list built by hand cannot report one ring
 * to the checks and another to the signer. The checks ring-sig's `lsagSign`
 * makes before it signs, other than of the private key, run on this list, in
 * its order and with its errors, so the signer is asked to sign exactly the
 * list that was checked, and never what ring-sig would refuse to sign. For
 * members that are a plain list of strings, these are the errors the local
 * helpers give.
 */
function signableRing(electionId: string, message: string, members: unknown, signerIndex: number): string[] {
  if (!Array.isArray(members)) throw new ValidationError('ring must be an array')
  if (byteLength(electionId) > MAX_ELECTION_ID_BYTES) {
    throw new ValidationError(`electionId length exceeds maximum of ${MAX_ELECTION_ID_BYTES} bytes`)
  }
  // Read once: the checks and the copy see the same length
  const length: unknown = members.length
  if (typeof length !== 'number' || !Number.isSafeInteger(length)) throw new ValidationError('ring must be an array')
  if (length < 2) throw new ValidationError('Ring must have at least 2 members')
  if (length > MAX_RING_SIZE) {
    throw new ValidationError(`Ring size ${length} exceeds maximum of ${MAX_RING_SIZE}`)
  }
  if (!Number.isInteger(signerIndex)) throw new ValidationError('Signer index must be an integer')
  if (signerIndex < 0 || signerIndex >= length) throw new ValidationError('Signer index out of range')
  const ring: string[] = []
  for (let index = 0; index < length; index += 1) {
    const member: unknown = members[index]
    if (typeof member !== 'string') throw new ValidationError(`Ring member at index ${index} is not a string`)
    ring.push(member.toLowerCase())
  }
  if (new Set(ring).size !== ring.length) {
    throw new ValidationError('Ring contains duplicate members')
  }
  const messageBytes = byteLength(message)
  if (messageBytes > MAX_MESSAGE_BYTES) {
    throw new ValidationError(`Message length ${messageBytes} exceeds maximum of ${MAX_MESSAGE_BYTES} bytes`)
  }
  // ring-sig reads every member as bytes, then every member as a point
  for (const member of ring) hexToBytes(member)
  for (const member of ring) {
    if (!/^[0-9a-f]{64}$/i.test(member)) {
      throw new ValidationError(`Invalid x-only public key: expected 64 hex chars, got ${member.length} chars`)
    }
    // An x-only key, as the point with even y
    secp256k1.Point.fromHex(`02${member}`).assertValidity()
  }
  return ring
}

/**
 * A list read once, by index, into a plain list of this helper's own. The
 * original's own kind of list is not used to make the copy, so nothing it
 * carries comes with it, and a list longer than any ring is not read at all.
 */
function listCopy(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined
  const length: unknown = value.length
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_RING_SIZE) return undefined
  const copy: unknown[] = []
  for (let index = 0; index < length; index += 1) copy.push(value[index])
  return copy
}

/** The fields of a signer's answer, each read once and checked for its shape. */
interface SignerAnswer {
  keyImage: string
  c0: string
  responses: string[]
  ring: string[]
  message: string
  electionId: string
  domain: string | undefined
}

/**
 * The signer's answer as fields of this helper's own, or undefined where it is
 * not an LSAG signature. A field that cannot be read at all, such as one
 * behind a revoked Proxy, is no answer either.
 */
function readAnswer(returned: unknown): SignerAnswer | undefined {
  try {
    if (typeof returned !== 'object' || returned === null) return undefined
    const { keyImage, c0, responses, ring, message, electionId, domain } = returned as Record<string, unknown>
    // Copied before they are checked, so what is checked is what is kept:
    // nothing attached to the signer's own lists travels on, and a list that
    // changes after the check cannot change the copy
    const ownResponses = listCopy(responses)
    const ownRing = listCopy(ring)
    if (
      typeof keyImage !== 'string' || !KEY_IMAGE_RE.test(keyImage)
      || typeof c0 !== 'string' || !HEX64_RE.test(c0)
      || ownResponses === undefined || ownResponses.some(response => typeof response !== 'string' || !HEX64_RE.test(response))
      || ownRing === undefined || ownRing.some(member => typeof member !== 'string')
      || typeof message !== 'string'
      || typeof electionId !== 'string'
      || (domain !== undefined && typeof domain !== 'string')
    ) {
      return undefined
    }
    return { keyImage, c0, responses: ownResponses as string[], ring: ownRing as string[], message, electionId, domain }
  } catch {
    return undefined
  }
}

/**
 * Check what an external signer returned and keep only the signature fields.
 * A signer is another program: its answer is checked like any other input, and
 * anything extra it attaches, such as the signing public key, is dropped so it
 * cannot travel on with the contribution. The answer is held to what this
 * helper asked for, not to the copy the signer was handed.
 */
function checkedSignature(
  returned: unknown,
  expected: LsagSignRequest,
): Contribution['signature'] {
  const answer = readAnswer(returned)
  if (answer === undefined) {
    throw new ValidationError('External signer did not return an LSAG signature')
  }
  const { keyImage, c0, responses: ownResponses, ring: ownRing, message, electionId: eid, domain } = answer
  // A domain is signed over. Any but ring-sig's own is one this helper did not
  // ask for, and a field the signer could fill with anything, such as its key.
  if (domain !== undefined && domain !== DEFAULT_LSAG_DOMAIN) {
    throw new ValidationError('External signer signed under an LSAG domain nostr-veil does not use')
  }
  if (message !== expected.message) {
    throw new ValidationError('External signer signed a different message')
  }
  if (eid !== expected.electionId) {
    throw new ValidationError('External signer signed under a different election id')
  }
  // Keys in any case are the same keys, and ring-sig reads them in lower case
  if (
    ownRing.length !== expected.ring.length
    || ownRing.some((member, index) => member.toLowerCase() !== expected.ring[index].toLowerCase())
  ) {
    throw new ValidationError('External signer signed over a different ring')
  }

  // The ring kept is this helper's own copy, as the local helpers keep it.
  // ring-sig's own domain is the one a signature without the field is read under.
  const signature: Contribution['signature'] = {
    keyImage,
    c0,
    responses: ownResponses,
    ring: [...expected.ring],
    message,
    electionId: eid,
  }
  if (!lsagVerify(signature)) {
    throw new ValidationError('External signer returned an invalid LSAG signature')
  }
  return signature
}

/**
 * Produce an anonymous contribution with a signer that holds the private key
 * elsewhere, so the key never enters this process.
 *
 * The signer is asked to LSAG-sign the same message, ring and election id that
 * {@link contributeAssertion} signs locally, and its answer is verified before
 * it is used. A ring signature hides which member signed, so the answer cannot
 * be checked against `memberIndex`: a signer holding another member's key would
 * produce an equally valid contribution, as that member.
 *
 * The ring that ring-sig's checks run on, and that the signer is asked to
 * sign, is the circle's members read once, by index, as a plain list of 2 to
 * 1,000 strings, in lower case as ring-sig signs them. A member that is not a
 * string is turned away.
 *
 * @param circle - Trust circle created via {@link createTrustCircle}
 * @param subject - The d-tag value (hex pubkey for kind 30382)
 * @param metrics - Metric key-value pairs
 * @param signer - Holds the member's key; see {@link LsagSigner}
 * @param memberIndex - 0-based index of this member in `circle.members`
 * @returns A {@link Contribution}, as from {@link contributeAssertion}
 * @throws {ValidationError} If the member at `memberIndex` is the `subject`, `metrics` is not an object (a function is not taken as one), a member is not a string, ring-sig would refuse to sign the request (an election id over 512 bytes, members that are not a list, fewer than 2 or more than 1,000 of them or one twice, a `memberIndex` that is not an integer or not a position among them, or a message over 65,536 bytes), or the signer's answer, once settled, is not an LSAG signature, cannot be read, is for another message, election id or ring, is under an LSAG domain of its own, or does not verify. For members that are a plain list of strings, ring-sig's checks give the errors the local helpers give, in ring-sig's order, and a member key that is not hex, or not a curve point, throws the error ring-sig's own reading of it gives.
 * @throws {TypeError} If `circle.members` is null or undefined, or `memberIndex` cannot be used as an index at all, as in the local helpers
 * @throws Whatever the signer throws, or fails with while its answer settles, as it is: a member declining, say.
 */
export async function contributeAssertionAsync(
  circle: TrustCircle,
  subject: string,
  metrics: Record<string, number>,
  signer: LsagSigner,
  memberIndex: number,
  options?: ContributionOptions,
): Promise<Contribution> {
  // The metrics are read once, now: the caller's object may change while the
  // signer works, and the contribution must hold what was signed
  const inputs = signingInputs(circle, subject, metrics, memberIndex, options)
  const ring = signableRing(inputs.electionId, inputs.message, circle.members, memberIndex)
  // The ring the signer signs over is this copy, so the guard holds for it too
  if (isSubject(ring[memberIndex], subject)) {
    throw new ValidationError('A circle member cannot contribute to an assertion about themselves')
  }
  // The answer is held to this. The signer is handed a copy of its own, so
  // nothing it does to that changes what its answer is held to.
  const expected: LsagSignRequest = { electionId: inputs.electionId, message: inputs.message, ring, signerIndex: memberIndex }
  // Whatever the signer throws, or fails with while its answer settles, such
  // as a member declining, is the signer's own, and is passed on as it is
  const answer: unknown = await signer.lsagSign({ ...expected, ring: [...ring] })
  const signature = checkedSignature(answer, expected)

  return {
    signature,
    keyImage: signature.keyImage,
    metrics: inputs.metrics,
  }
}

/** {@link contributeEventAssertion} with an external signer. */
export async function contributeEventAssertionAsync(
  circle: TrustCircle,
  eventId: string,
  metrics: Record<string, number>,
  signer: LsagSigner,
  memberIndex: number,
  options?: TypedContributionOptions,
): Promise<Contribution> {
  return contributeAssertionAsync(
    circle,
    eventId,
    metrics,
    signer,
    memberIndex,
    typedOptions(options, NIP85_KINDS.EVENT, 'e', eventId),
  )
}

/** {@link contributeAddressableAssertion} with an external signer. */
export async function contributeAddressableAssertionAsync(
  circle: TrustCircle,
  address: string,
  metrics: Record<string, number>,
  signer: LsagSigner,
  memberIndex: number,
  options?: TypedContributionOptions,
): Promise<Contribution> {
  return contributeAssertionAsync(
    circle,
    address,
    metrics,
    signer,
    memberIndex,
    typedOptions(options, NIP85_KINDS.ADDRESSABLE, 'a', address),
  )
}

/** {@link contributeIdentifierAssertion} with an external signer. */
export async function contributeIdentifierAssertionAsync(
  circle: TrustCircle,
  identifier: string,
  kTag: string,
  metrics: Record<string, number>,
  signer: LsagSigner,
  memberIndex: number,
  options?: TypedContributionOptions,
): Promise<Contribution> {
  return contributeAssertionAsync(
    circle,
    identifier,
    metrics,
    signer,
    memberIndex,
    typedOptions(options, NIP85_KINDS.IDENTIFIER, 'k', kTag),
  )
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
