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

const commentMetric: MetricProfile = {
  name: 'comment_cnt',
  meaning: 'Count-like review or discussion signal.',
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

interface SafetyOptions {
  proofClaims: string[]
  proofLimitations: string[]
  recommendedActions: string[]
  requiredControls: Array<{ risk: string; control: string }>
}

const commonFailurePolicy = [
  'Reject malformed NIP-85 events and invalid nostr-veil proofs.',
  'Reject stale assertions outside the application freshness window.',
  'Reject assertions from circles that are not accepted by the deployment policy.',
  'Treat the score as a threshold signal, not as proof that the underlying real-world claim is true.',
]

const commonProofClaims = [
  'Distinct members of the accepted circle contributed to the same canonical subject.',
  'The published aggregate metrics match the signed anonymous contributions.',
  'Proof v2 binds the contribution to the NIP-85 kind and subject hint used by the profile.',
]

const commonProofLimitations = [
  'It does not prove the underlying real-world claim is true.',
  'It does not prove the circle is socially legitimate or Sybil-resistant.',
  'It does not replace deployment policy, freshness, revocation, or evidence handling.',
]

const commonRequiredControls = [
  {
    risk: 'Untrusted or stale circle membership.',
    control: 'Use accepted circle manifests with admission, rotation, revocation, expiry, and conflict rules.',
  },
  {
    risk: 'Ambiguous or replayed subjects.',
    control: 'Canonicalise the subject before signing and verify the exact expected subject, kind, and subject hint.',
  },
  {
    risk: 'Unsafe automatic action from a score alone.',
    control: 'Gate application decisions with metric bounds, freshness, thresholds, audit logs, and manual-review fallbacks.',
  },
]

function safety(options: SafetyOptions): Pick<
  UseCaseProfile,
  'proofClaims' | 'proofLimitations' | 'recommendedActions' | 'requiredControls'
> {
  return {
    proofClaims: [...commonProofClaims, ...options.proofClaims],
    proofLimitations: [...commonProofLimitations, ...options.proofLimitations],
    recommendedActions: options.recommendedActions,
    requiredControls: [...commonRequiredControls, ...options.requiredControls],
  }
}

const peopleControls = [
  {
    risk: 'The score could be used as an unappealable judgement about a person.',
    control: 'Publish appeal, evidence-retention, reviewer-conflict, and moderation-escalation rules before acting on the score.',
  },
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
  ...safety({
    proofClaims: [
      'The accepted reviewers produced an anonymous threshold signal about the target pubkey.',
    ],
    proofLimitations: [
      'It does not prove abuse occurred or that a user should be punished automatically.',
    ],
    recommendedActions: [
      'Show reputation context, queue moderation review, or apply proportionate friction according to the community policy.',
    ],
    requiredControls: peopleControls,
  }),
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
  ...safety({
    proofClaims: [
      'The accepted onboarding circle vouched for the target pubkey without revealing which members contributed.',
    ],
    proofLimitations: [
      'It does not prove the person is safe, unique, non-Sybil, or entitled to unlimited access.',
    ],
    recommendedActions: [
      'Use the signal to reduce onboarding friction, then keep normal rate limits, abuse monitoring, and recovery paths.',
    ],
    requiredControls: [
      ...peopleControls,
      {
        risk: 'Onboarding can become a Sybil shortcut.',
        control: 'Combine the score with rate limits, staged permissions, abuse monitoring, and circle accountability.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'The accepted editorial or review circle anonymously corroborated the same source identifier.',
    ],
    proofLimitations: [
      'It does not prove the source is truthful, safe to expose, or safe to contact.',
    ],
    recommendedActions: [
      'Use the signal to route editorial attention while preserving separate fact-checking and source-protection workflows.',
    ],
    requiredControls: [
      {
        risk: 'Corroboration can expose source relationships or operational timing.',
        control: 'Use secure collection, batching, minimised logs, source-protection rules, and separate evidence review.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'The accepted fact-checking or moderation circle anonymously scored the exact event id.',
    ],
    proofLimitations: [
      'It does not prove the event is objectively true or false.',
    ],
    recommendedActions: [
      'Display context, confidence, or review status beside the event, with correction and dispute paths.',
    ],
    requiredControls: [
      {
        risk: 'A claim score can be mistaken for a final truth judgement.',
        control: 'Maintain methodology, evidence, correction, dispute, and reviewer-conflict policies outside the proof.',
      },
    ],
  }),
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
  metrics: [rankMetric, commentMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
  ...safety({
    proofClaims: [
      'The accepted reviewers anonymously scored the exact addressable article, research note, or long-form record.',
    ],
    proofLimitations: [
      'It does not prove the research is correct, reproducible, or free of conflicts.',
    ],
    recommendedActions: [
      'Show review confidence, request further review, or gate publication features according to the editorial policy.',
    ],
    requiredControls: [
      {
        risk: 'A review score can hide methodology or conflicts.',
        control: 'Keep separate methods, evidence, conflict-of-interest, correction, reproducibility, and reviewer-selection policies.',
      },
    ],
  }),
})

export const RELAY_SERVICE_REPUTATION_PROFILE = profile({
  id: 'relay-service-reputation',
  title: 'Relay and service reputation',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '10002',
  subjectFormats: ['relay', 'service'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
  ...safety({
    proofClaims: [
      'The accepted service-review circle anonymously scored the same relay or service endpoint.',
    ],
    proofLimitations: [
      'It does not prove live uptime, honest operation, censorship resistance, or absence of malware.',
    ],
    recommendedActions: [
      'Use the signal for relay or service preference, warnings, or routing hints alongside live telemetry.',
    ],
    requiredControls: [
      {
        risk: 'Service behaviour changes faster than reputation.',
        control: 'Pair the score with uptime probes, latency checks, incident reports, expiry, and downgrade assertions.',
      },
      {
        risk: 'Different service classes on one domain can be confused.',
        control: 'Use separate canonical subjects and namespaces for relays, upload services, moderation APIs, bots, and other services.',
      },
    ],
  }),
})

export const NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE = profile({
  id: 'nip05-domain-service-provider-trust',
  title: 'NIP-05, domain, and service-provider trust',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['nip05', 'domain', 'lnurlp', 'nip96', 'service'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: commonFailurePolicy,
  ...safety({
    proofClaims: [
      'The accepted provider-review circle anonymously scored the same NIP-05, domain, LNURLp, NIP-96, or service-provider subject.',
    ],
    proofLimitations: [
      'It does not prove DNS, HTTPS, NIP-05, LNURLp, or NIP-96 verification succeeded.',
    ],
    recommendedActions: [
      'Show provider trust context or warnings only after the underlying protocol verification still passes.',
    ],
    requiredControls: [
      {
        risk: 'Provider reputation can be confused with protocol verification.',
        control: 'Continue to verify DNS, HTTPS, NIP-05, LNURLp, NIP-96, and service metadata directly.',
      },
      {
        risk: 'Domains and service endpoints can be taken over or delegated.',
        control: 'Use expiry, ownership-change monitoring, incident response, and separate subjects for delegated services.',
      },
    ],
  }),
})

export const VERIFIER_ISSUER_LEGITIMACY_PROFILE = profile({
  id: 'verifier-issuer-legitimacy',
  title: 'Verifier and issuer legitimacy',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['verifier', 'service'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric, reactionMetric],
  failurePolicy: [
    ...commonFailurePolicy,
    'Do not treat verifier legitimacy as proof that every attestation from that verifier is true.',
  ],
  ...safety({
    proofClaims: [
      'The accepted reviewer circle anonymously scored the same verifier, issuer, witness service, or method-scoped verifier subject.',
    ],
    proofLimitations: [
      'It does not prove a verifier performed a specific ceremony correctly or that an issued credential is true.',
    ],
    recommendedActions: [
      'Use the signal to decide whether a community should accept, warn about, rate-limit, or manually review attestations from that verifier under the credential-class policy.',
    ],
    requiredControls: [
      {
        risk: 'Verifier reputation can become a single unchecked trust root.',
        control: 'Scope trust by credential class, verification method, issuer key, expiry, revocation source, appeal path, and incident response.',
      },
      {
        risk: 'A trusted verifier can still issue a bad or stale attestation.',
        control: 'Verify the concrete attestation artefact, holder binding, presentation challenge, expiry, revocation, and evidence trail before accepting it.',
      },
    ],
  }),
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
  metrics: [rankMetric, reactionMetric],
  failurePolicy: commonFailurePolicy,
  ...safety({
    proofClaims: [
      'The accepted reviewers anonymously scored the exact addressable list, labeler, or moderation-list event.',
    ],
    proofLimitations: [
      'It does not prove the list is fair, complete, or suitable for every community.',
    ],
    recommendedActions: [
      'Use the signal to choose, warn about, or review lists while preserving local moderation policy.',
    ],
    requiredControls: [
      {
        risk: 'List reputation can become outsourced moderation without accountability.',
        control: 'Publish reviewer criteria, appeal paths, list-change review, community override rules, and conflict policies.',
      },
    ],
  }),
})

export const RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE = profile({
  id: 'release-package-maintainer-reputation',
  title: 'Release, package, and maintainer reputation',
  group: 'Infrastructure',
  status: 'supported',
  kind: NIP85_KINDS.IDENTIFIER,
  subjectTag: 'k',
  subjectTagValue: '0',
  subjectFormats: ['package', 'package-digest', 'git', 'maintainer'],
  proofVersion: 'v2',
  minDistinctSigners: 3,
  maxAgeSeconds: 300,
  metrics: [rankMetric],
  failurePolicy: [
    ...commonFailurePolicy,
    'Do not treat the score as a package scan, SBOM, provenance, or reproducible-build proof.',
  ],
  ...safety({
    proofClaims: [
      'The accepted security-review circle anonymously scored the exact package, release, repository, or maintainer subject.',
    ],
    proofLimitations: [
      'It does not prove the package is safe, scanned, reproducibly built, or backed by valid provenance.',
    ],
    recommendedActions: [
      'Surface reviewed-release confidence, queue manual review, or block high-risk automation until external artefact checks pass.',
    ],
    requiredControls: [
      {
        risk: 'A reputation score can be mistaken for a software supply-chain proof.',
        control: 'Combine it with signatures, provenance, SBOMs, reproducible builds, vulnerability scans, CI, malware checks, and human audit.',
      },
      {
        risk: 'Package, release, repository, and maintainer risk are different.',
        control: 'Use separate canonical subjects for packages, versions, artefact digests, repositories, commits, and maintainer identities.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'The accepted marketplace or buyer-review circle anonymously scored the same vendor identifier.',
    ],
    proofLimitations: [
      'It does not prove fulfilment, legality, solvency, product quality, or absence of fraud.',
    ],
    recommendedActions: [
      'Use the score for warnings, review queues, escrow friction, or search ranking under the marketplace policy.',
    ],
    requiredControls: [
      {
        risk: 'Vendor scores can be gamed or misapplied across contexts.',
        control: 'Use purchase evidence, dispute handling, escrow rules, category-specific policy, and review-fraud monitoring.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'Accepted scoped circles contributed enough distinct anonymous reviewers across the federation.',
    ],
    proofLimitations: [
      'It does not prove a moderation action is fair, lawful, or appropriate without human review.',
    ],
    recommendedActions: [
      'Queue human moderation review, add friction, or display federation context rather than auto-banning from the proof alone.',
    ],
    requiredControls: [
      {
        risk: 'Cross-circle overlap can inflate or deanonymise moderation evidence if scoped incorrectly.',
        control: 'Require shared federation scope, verify distinct signers across circles, and document when overlap disclosure is acceptable.',
      },
      {
        risk: 'Federated signals can bypass local governance.',
        control: 'Keep local appeal, evidence, reviewer-conflict, escalation, and community override processes.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'The accepted reviewers anonymously scored the exact proposal or grant address.',
    ],
    proofLimitations: [
      'It does not prove the applicant can deliver, that funding is lawful, or that conflicts are absent.',
    ],
    recommendedActions: [
      'Use the score for triage, shortlisting, additional review, or disclosure prompts under the funding policy.',
    ],
    requiredControls: [
      {
        risk: 'Funding scores can hide conflicts or replace due diligence.',
        control: 'Maintain eligibility checks, conflict disclosures, budget review, milestone policy, appeals, and public accountability.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'The accepted circle can provide an anonymous threshold signal about a credential or attestation event.',
    ],
    proofLimitations: [
      'It is not yet a complete credential issuance, disclosure, revocation, or holder-binding protocol.',
    ],
    recommendedActions: [
      'Use this only as a building block until the credential endorsement profile, holder flow, and revocation model are defined.',
    ],
    requiredControls: [
      {
        risk: 'A threshold signal can be mistaken for a complete anonymous credential.',
        control: 'Define issuer trust, holder binding, selective disclosure, expiry, revocation, replay protection, and verifier challenge flow.',
      },
    ],
  }),
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
  ...safety({
    proofClaims: [
      'The accepted admission circle anonymously vouched for the target pubkey.',
    ],
    proofLimitations: [
      'It is not a complete authentication, authorisation, rate-limit, payment, or abuse-response protocol.',
    ],
    recommendedActions: [
      'Use the signal as one admission input alongside account creation, rate limits, monitoring, and appeal handling.',
    ],
    requiredControls: [
      {
        risk: 'Admission can become permanent unchecked access.',
        control: 'Pair the score with explicit admission policy, staged permissions, rate limits, revocation, expiry, and abuse response.',
      },
    ],
  }),
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
  VERIFIER_ISSUER_LEGITIMACY_PROFILE,
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
