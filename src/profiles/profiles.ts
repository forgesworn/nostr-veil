import { NIP85_KINDS } from '../nip85/types.js'
import type { MetricProfile, UseCaseProfile } from './types.js'

const rankMetric: MetricProfile = {
  name: 'rank',
  meaning: 'Application-defined confidence score from 0 to 100.',
  direction: 'higher-is-better',
}

const reactionMetric: MetricProfile = {
  name: 'reaction_cnt',
  meaning: 'Count-like corroborating interaction signal.',
  direction: 'count',
}

const reportMetric: MetricProfile = {
  name: 'reports_cnt_recd',
  meaning: 'Count of received reports included in the signed reviewer signal.',
  direction: 'count',
}

function profile(profile: UseCaseProfile): UseCaseProfile {
  return profile
}

const commonFailurePolicy = [
  'Reject malformed NIP-85 events and invalid nostr-veil proofs.',
  'Reject stale assertions outside the application freshness window.',
  'Reject assertions from circles that are not accepted by the deployment policy.',
  'Treat the score as a threshold signal, not as proof that the underlying real-world claim is true.',
]

export const USER_REPUTATION_ABUSE_REPORTING_PROFILE = profile({
  id: 'user-reputation-abuse-reporting',
  title: 'User reputation and abuse reporting',
  group: 'People',
  status: 'supported',
  kind: NIP85_KINDS.USER,
  subjectTag: 'p',
  subjectFormats: ['pubkey'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reportMetric],
  failurePolicy: commonFailurePolicy,
})

export const PRIVACY_PRESERVING_ONBOARDING_PROFILE = profile({
  id: 'privacy-preserving-onboarding',
  title: 'Privacy-preserving onboarding',
  group: 'People',
  status: 'supported',
  kind: NIP85_KINDS.USER,
  subjectTag: 'p',
  subjectFormats: ['pubkey'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: commonFailurePolicy,
})

export const SOURCE_CORROBORATION_PROFILE = profile({
  id: 'source-corroboration',
  title: 'Source corroboration',
  group: 'Content',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['source'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: commonFailurePolicy,
})

export const EVENT_CLAIM_VERIFICATION_PROFILE = profile({
  id: 'event-claim-verification',
  title: 'Event and claim verification',
  group: 'Content',
  status: 'supported',
  kind: NIP85_KINDS.EVENT,
  subjectTag: 'e',
  subjectFormats: ['event'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
})

export const ARTICLE_RESEARCH_REVIEW_PROFILE = profile({
  id: 'article-research-review',
  title: 'Article, research, and long-form review',
  group: 'Content',
  status: 'supported',
  kind: NIP85_KINDS.ADDRESSABLE,
  subjectTag: 'a',
  subjectFormats: ['address'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
})

export const RELAY_SERVICE_REPUTATION_PROFILE = profile({
  id: 'relay-service-reputation',
  title: 'Relay and service reputation',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '10002',
  subjectFormats: ['relay'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
})

export const NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE = profile({
  id: 'nip05-domain-service-provider-trust',
  title: 'NIP-05, domain, and service-provider trust',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['nip05', 'domain'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: commonFailurePolicy,
})

export const LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE = profile({
  id: 'list-labeler-moderation-list-reputation',
  title: 'Community list, labeler, and moderation-list reputation',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.ADDRESSABLE,
  subjectTag: 'a',
  subjectFormats: ['address'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: commonFailurePolicy,
})

export const RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE = profile({
  id: 'release-package-maintainer-reputation',
  title: 'Release, package, and maintainer reputation',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['package'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: [
    ...commonFailurePolicy,
    'Do not treat the score as a package scan, SBOM, provenance, or reproducible-build proof.',
  ],
})

export const VENDOR_MARKETPLACE_SIGNALS_PROFILE = profile({
  id: 'vendor-marketplace-signals',
  title: 'Vendor and marketplace signals',
  group: 'Markets',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['vendor'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
})

export const FEDERATED_MODERATION_PROFILE = profile({
  id: 'federated-moderation',
  title: 'Federated moderation',
  group: 'Governance',
  status: 'supported',
  kind: NIP85_KINDS.USER,
  subjectTag: 'p',
  subjectFormats: ['pubkey'],
  proofVersion: 'v2',
  minDistinctSigners: 4,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reportMetric],
  federation: {
    minCircles: 2,
    requireScope: true,
  },
  failurePolicy: [
    ...commonFailurePolicy,
    'Reject federations that mix subjects, scopes, or unscoped events.',
  ],
})

export const GRANT_FUNDING_PROPOSAL_REVIEW_PROFILE = profile({
  id: 'grant-funding-proposal-review',
  title: 'Grant, funding, and proposal review',
  group: 'Governance',
  status: 'supported',
  kind: NIP85_KINDS.ADDRESSABLE,
  subjectTag: 'a',
  subjectFormats: ['address'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: commonFailurePolicy,
})

export const ANONYMOUS_CREDENTIAL_ATTESTATION_COSIGNING_PROFILE = profile({
  id: 'anonymous-credential-attestation-cosigning',
  title: 'Anonymous credential or attestation co-signing',
  group: 'Future profiles',
  status: 'profile-needed',
  kind: NIP85_KINDS.EVENT,
  subjectTag: 'e',
  subjectFormats: ['event'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: [
    ...commonFailurePolicy,
    'Treat this as today\'s proof building block until the credential endorsement profile is final.',
  ],
})

export const RELAY_COMMUNITY_ADMISSION_PROFILE = profile({
  id: 'relay-community-admission',
  title: 'Relay or community admission',
  group: 'Future profiles',
  status: 'profile-needed',
  kind: NIP85_KINDS.USER,
  subjectTag: 'p',
  subjectFormats: ['pubkey'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: [
    ...commonFailurePolicy,
    'Treat this as an admission signal, not as the complete access-control protocol.',
  ],
})

export const USE_CASE_PROFILES = [
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  PRIVACY_PRESERVING_ONBOARDING_PROFILE,
  SOURCE_CORROBORATION_PROFILE,
  EVENT_CLAIM_VERIFICATION_PROFILE,
  ARTICLE_RESEARCH_REVIEW_PROFILE,
  RELAY_SERVICE_REPUTATION_PROFILE,
  NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
  LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  VENDOR_MARKETPLACE_SIGNALS_PROFILE,
  FEDERATED_MODERATION_PROFILE,
  GRANT_FUNDING_PROPOSAL_REVIEW_PROFILE,
  ANONYMOUS_CREDENTIAL_ATTESTATION_COSIGNING_PROFILE,
  RELAY_COMMUNITY_ADMISSION_PROFILE,
] as const satisfies readonly UseCaseProfile[]

export const USE_CASE_PROFILE_BY_ID = Object.freeze(
  Object.fromEntries(USE_CASE_PROFILES.map(profile => [profile.id, profile])),
) as Readonly<Record<string, UseCaseProfile | undefined>>

export function getUseCaseProfile(id: string): UseCaseProfile | undefined {
  return USE_CASE_PROFILE_BY_ID[id]
}
