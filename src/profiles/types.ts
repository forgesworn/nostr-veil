import type { EventTemplate, ValidationResult } from '../nip85/types.js'
import type {
  AggregateFn,
  FederationVerification,
  ProofVerification,
  ProofVersion,
  SubjectTag,
} from '../proof/types.js'

export type UseCaseProfileStatus = 'supported' | 'profile-needed'

export type SubjectFormat =
  | 'pubkey'
  | 'event'
  | 'address'
  | 'identifier'
  | 'relay'
  | 'nip05'
  | 'domain'
  | 'package'
  | 'vendor'
  | 'source'

export interface MetricProfile {
  name: string
  meaning: string
  direction: 'higher-is-better' | 'lower-is-better' | 'count' | 'application-defined'
}

export interface FederationProfile {
  minCircles: number
  requireScope: boolean
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
  metrics: MetricProfile[]
  federation?: FederationProfile
  failurePolicy: string[]
}

export interface VerifyUseCaseProfileOptions {
  acceptedCircleIds?: Iterable<string>
  aggregateFn?: AggregateFn
  expectedSubject?: string
  expectedSubjectTagValue?: string
  maxAgeSeconds?: number
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
  events: VerifiedProfileEvent[]
  federation?: FederationVerification
  profile: UseCaseProfile
}
