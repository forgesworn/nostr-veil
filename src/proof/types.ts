/** A trust circle is a fixed group of pubkeys */
export interface TrustCircle {
  /** Sorted array of x-only hex pubkeys (64 chars each) */
  members: string[]
  /** SHA-256 hash of sorted pubkeys joined with ':' */
  circleId: string
  /** Number of members */
  size: number
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

/** Result of proof verification */
export interface ProofVerification {
  valid: boolean
  circleSize: number
  threshold: number
  distinctSigners: number
  errors: string[]
}
