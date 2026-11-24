import type { EventTemplate, ValidationResult } from '../nip85/types.js'
import type {
  AggregateFn,
  AggregateTagValue,
  ContributionBound,
  ContributionBounds,
  FederationVerification,
  ProofVerification,
  ProofVersion,
  SubjectTag,
} from '../proof/types.js'
import type { VerificationIssue } from './issues.js'

export type UseCaseProfileStatus = 'supported' | 'profile-needed'

export type SubjectFormat =
  | 'pubkey'
  | 'event'
  | 'address'
  | 'identifier'
  | 'relay'
  | 'nip05'
  | 'domain'
  | 'git'
  | 'lnurlp'
  | 'maintainer'
  | 'nip96'
  | 'package'
  | 'package-digest'
  | 'service'
  | 'vendor'
  | 'verifier'
  | 'source'

export interface MetricProfile {
  name: string
  meaning: string
  direction: 'higher-is-better' | 'lower-is-better' | 'count' | 'application-defined'
  /**
   * Bounds every single contribution's value must satisfy. Set this whenever
   * the profile's aggregate is not `median`: under `sum`, `mean`, `min` or
   * `max` one member's value can move the published result.
   */
  contribution?: ContributionBound
}

export interface FederationProfile {
  minCircles: number
  requireScope: boolean
}

export interface UseCaseRequiredControl {
  risk: string
  control: string
}

export interface UseCaseProfile {
  id: string
  title: string
  group: string
  status: UseCaseProfileStatus
  kind: number
  subjectTag: SubjectTag
  subjectTagValue?: string
  subjectFormats: SubjectFormat[]
  proofVersion: ProofVersion
  minDistinctSigners: number
  maxAgeSeconds: number
  /**
   * The aggregate function an event must be published with, read from its
   * `veil-agg` tag. The publisher picks that tag and the circle does not sign
   * it, so a profile that leaves this unset accepts the same signatures
   * republished as a `max` or a `min`. Every built-in profile sets it.
   */
  aggregate?: AggregateTagValue
  metrics: MetricProfile[]
  federation?: FederationProfile
  failurePolicy: string[]
  proofClaims?: string[]
  proofLimitations?: string[]
  recommendedActions?: string[]
  requiredControls?: UseCaseRequiredControl[]
}

export interface UseCaseProfileDefinitionValidation extends ValidationResult {
  warnings: string[]
}

export interface VerifyUseCaseProfileOptions {
  acceptedCircleIds?: Iterable<string>
  /** Require this aggregate function in place of the one the profile pins. */
  aggregate?: AggregateTagValue
  aggregateFn?: AggregateFn
  /**
   * Bounds on each contribution, by metric name. An entry here replaces the
   * profile's bound for that metric; metrics not named keep the profile's.
   */
  contributionBounds?: ContributionBounds
  expectedSubject?: string
  expectedSubjectTagValue?: string
  /**
   * Freshness window in seconds, in place of the profile's. 0 switches the
   * window off. A value that is not a non-negative integer is an error: read
   * as it stands, a word or a negative number would switch the window off too.
   */
  maxAgeSeconds?: number
  /**
   * How far ahead of `now` an assertion's `created_at` may be, in seconds,
   * before it is rejected. It is the upper end of the freshness window, so
   * setting it while `maxAgeSeconds` is 0 is an error. Only the signer sets
   * `created_at`, and an event dated ahead stays inside the window until that
   * date plus the window. Default: `DEFAULT_MAX_FUTURE_SECONDS`.
   */
  maxFutureSeconds?: number
  minDistinctSigners?: number
  now?: number
  requireKnownCircle?: boolean
}

export interface VerifiedProfileEvent {
  event: EventTemplate
  circleId: string | null
  proof: ProofVerification
  subject: string | null
  syntax: ValidationResult
}

export interface UseCaseProfileVerification {
  valid: boolean
  errors: string[]
  issues?: VerificationIssue[]
  events: VerifiedProfileEvent[]
  federation?: FederationVerification
  profile: UseCaseProfile
}
