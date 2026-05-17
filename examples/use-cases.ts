/**
 * Executable use-case examples for nostr-veil.
 *
 * Each detail page in docs/use-case-pages includes one file from
 * examples/use-cases/. This runner imports those canonical examples and fails
 * if any example no longer verifies.
 *
 * Run: npx tsx examples/use-cases.ts
 */
import { result as anonymousCredentialAttestationCosigning } from './use-cases/anonymous-credential-attestation-cosigning.js'
import { result as articleResearchReview } from './use-cases/article-research-review.js'
import { result as eventClaimVerification } from './use-cases/event-claim-verification.js'
import { result as federatedModeration } from './use-cases/federated-moderation.js'
import { result as grantFundingProposalReview } from './use-cases/grant-funding-proposal-review.js'
import { result as listLabelerModerationListReputation } from './use-cases/list-labeler-moderation-list-reputation.js'
import { result as nip05DomainServiceProviderTrust } from './use-cases/nip05-domain-service-provider-trust.js'
import { result as privacyPreservingOnboarding } from './use-cases/privacy-preserving-onboarding.js'
import { result as relayCommunityAdmission } from './use-cases/relay-community-admission.js'
import { result as relayServiceReputation } from './use-cases/relay-service-reputation.js'
import { result as releasePackageMaintainerReputation } from './use-cases/release-package-maintainer-reputation.js'
import { result as sourceCorroboration } from './use-cases/source-corroboration.js'
import { result as userReputationAbuseReporting } from './use-cases/user-reputation-abuse-reporting.js'
import { result as vendorMarketplaceSignals } from './use-cases/vendor-marketplace-signals.js'
import { printResult } from './use-cases/_shared.js'

const results = [
  userReputationAbuseReporting,
  privacyPreservingOnboarding,
  sourceCorroboration,
  eventClaimVerification,
  articleResearchReview,
  relayServiceReputation,
  nip05DomainServiceProviderTrust,
  listLabelerModerationListReputation,
  releasePackageMaintainerReputation,
  vendorMarketplaceSignals,
  federatedModeration,
  grantFundingProposalReview,
  anonymousCredentialAttestationCosigning,
  relayCommunityAdmission,
]

for (const result of results) {
  printResult(result)
}
