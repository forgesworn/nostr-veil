/** A trust circle is a fixed group of pubkeys */
export interface TrustCircle {
  /** Sorted array of x-only hex pubkeys (64 chars each) */
  members: string[]
  /** SHA-256 hash of sorted pubkeys joined with ':' */
  circleId: string
  /** Number of members */
  size: number
  /**
   * Optional federation scope for cross-circle deduplication. When set, every
   * contribution's LSAG key image is scoped to this string instead of the
   * `circleId`, so the same member produces a matching key image in any circle
   * that shares the scope. Omit for the default per-circle isolation.
   */
  scope?: string
}

/** A single member's contribution to a circle assertion */
export interface Contribution {
  /** LSAG signature object from @forgesworn/ring-sig */
  signature: {
    keyImage: string
    c0: string
    responses: string[]
    ring: string[]
    message: string
    electionId: string
    domain?: string
  }
  /** Key image hex (from LSAG) */
  keyImage: string
  /** The metrics this member contributed */
  metrics: Record<string, number>
}

/** Aggregation function type */
export type AggregateFn = (values: number[]) => number

/** Supported proof wire formats. The typed contribute helpers sign v2 by default; contributeAssertion signs v1 unless asked. */
export type ProofVersion = 'v1' | 'v2'

/** Subject hint tags that can be bound into a v2 proof. */
export type SubjectTag = 'p' | 'e' | 'a' | 'k'

/** Optional semantic context for proof construction and verification. */
export interface ProofContext {
  /** Proof wire format to emit or require. Omit for the v1 default. */
  proofVersion?: ProofVersion
  /** NIP-85 assertion kind being signed, required for v2 proofs. */
  kind?: number
  /** Subject hint tag bound by the v2 proof. */
  subjectTag?: SubjectTag
  /** Subject hint tag value bound by the v2 proof. */
  subjectTagValue?: string
}

/** 
 * Names of the built-in aggregate functions. The `veil-agg` tag on an
 * aggregated event records which one produced the metric tags, so a verifier
 * can recompute the aggregate without the function being supplied out-of-band.
 */
export type AggregateName = 'median' | 'mean' | 'sum' | 'min' | 'max'

/** Result of proof verification */
export interface ProofVerification {
  valid: boolean
  circleSize: number
  threshold: number
  distinctSigners: number
  /**
   * True when the d-tag subject is also a veil-ring member, so one valid signature may be the subject's own.
   * Meaningful for kind 30382, where the subject is a pubkey. On other kinds the d-tag is an event id, address
   * or identifier and cannot equal a member pubkey except by hash collision; it is computed the same way on every kind.
   */
  subjectInRing: boolean
  /** distinctSigners, less one when subjectInRing: the signatures that cannot be the subject's. */
  independentSigners: number
  errors: string[]
}

/** Result of verifying a federation of scoped circle assertions */
export interface FederationVerification {
  /** True when every event verified and they share a single subject and scope */
  valid: boolean
  /** The subject (d-tag) the verified events agree on, or null if they disagree or none verified */
  subject: string | null
  /** The federation scope the verified events agree on, or null if they disagree or none verified */
  scope: string | null
  /** Number of distinct circles (by circleId) across the events */
  circleCount: number
  /** Total signatures across all events; a contributor in N circles counts N times */
  totalSignatures: number
  /** Distinct contributors across the federation, deduplicated by LSAG key image */
  distinctSigners: number
  /** True when any verified event's ring contains the subject, so one signature across the federation may be the subject's own */
  subjectInRing: boolean
  /** distinctSigners, less one when subjectInRing: the subject holds at most one key image across the shared scope */
  independentSigners: number
  /** Verification errors, each per-event error prefixed with its index; empty when valid */
  errors: string[]
}
