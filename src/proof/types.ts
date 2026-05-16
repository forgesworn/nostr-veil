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
  errors: string[]
}
