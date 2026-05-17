import { result as anonymousCredentialAttestationCosigning } from './anonymous-credential-attestation-cosigning.js'
import { result as articleResearchReview } from './article-research-review.js'
import { result as eventClaimVerification } from './event-claim-verification.js'
import { result as federatedModeration } from './federated-moderation.js'
import { result as grantFundingProposalReview } from './grant-funding-proposal-review.js'
import { result as listLabelerModerationListReputation } from './list-labeler-moderation-list-reputation.js'
import { result as nip05DomainServiceProviderTrust } from './nip05-domain-service-provider-trust.js'
import { result as privacyPreservingOnboarding } from './privacy-preserving-onboarding.js'
import { result as relayCommunityAdmission } from './relay-community-admission.js'
import { result as relayServiceReputation } from './relay-service-reputation.js'
import { result as releasePackageMaintainerReputation } from './release-package-maintainer-reputation.js'
import { result as sourceCorroboration } from './source-corroboration.js'
import { result as userReputationAbuseReporting } from './user-reputation-abuse-reporting.js'
import { result as vendorMarketplaceSignals } from './vendor-marketplace-signals.js'

export const useCaseResults = [
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
