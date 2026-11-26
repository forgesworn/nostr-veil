import { errorKinds } from '../nip85/error-kinds.js'

/**
 * Which of a proof's errors break a requirement the caller set, as distinct
 * from a proof that is simply not sound: the aggregate the proof must be
 * published under, and the bounds on what one member may sign. The verifier
 * above files those two kinds under issue codes of their own, and is told
 * which they are here, not by the words of the error.
 *
 * Internal: not exported from the package, and no part of a proof's result.
 */
export type ProofErrorKind = 'aggregate-mismatch' | 'contribution-out-of-bounds'

export const proofErrorKinds = errorKinds<ProofErrorKind>()
