import { verificationIssue } from './issues.js'
import { verifyDeploymentBundle } from './bundle.js'
import type { EventTemplate } from '../nip85/types.js'
import type { DeploymentBundleVerification, SignedDeploymentBundle, VerifyDeploymentBundleOptions } from './bundle.js'
import type { VerificationIssue } from './issues.js'

export interface VerifyProductionDeploymentOptions extends VerifyDeploymentBundleOptions {
  /**
   * Require the signed deployment bundle to expire. Defaults to true so stale
   * policy cannot live forever after a circle, profile, or publisher rotates.
   */
  requireBundleExpiry?: boolean
  /**
   * Require the bundled deployment policy to verify Nostr event signatures.
   * Defaults to true for relay-fetched production assertions.
   */
  requireSignedEvents?: boolean
}

export interface ProductionDeploymentVerification extends DeploymentBundleVerification {
  decision: 'accept' | 'reject'
}

function productionHardeningIssues(
  bundle: SignedDeploymentBundle,
  options: VerifyProductionDeploymentOptions,
): VerificationIssue[] {
  const issues: VerificationIssue[] = []

  if (options.requireBundleExpiry !== false && bundle.expiresAt === undefined) {
    issues.push(verificationIssue(
      'bundle.expiry_required',
      'production verifier requires bundle.expiresAt',
      'bundle.expiresAt',
    ))
  }

  if (options.requireSignedEvents !== false && bundle.policy.requireNostrSignature !== true) {
    issues.push(verificationIssue(
      'policy.nostr_signature_not_required',
      'production verifier requires policy.requireNostrSignature = true',
      'bundle.policy.requireNostrSignature',
    ))
  }

  return issues
}

/**
 * Verify a production deployment in one call.
 *
 * This wraps `verifyDeploymentBundle()` and adds opinionated fail-closed
 * controls that production relay/client integrations normally need: trusted
 * bundle publishers, expiring policy bundles, and signed relay-fetched events.
 */
export function verifyProductionDeployment(
  events: EventTemplate | readonly EventTemplate[],
  bundle: SignedDeploymentBundle,
  options: VerifyProductionDeploymentOptions = {},
): ProductionDeploymentVerification {
  const base = verifyDeploymentBundle(events, bundle, options)
  const hardeningIssues = productionHardeningIssues(bundle, options)
  const issues = [
    ...base.issues,
    ...hardeningIssues,
  ]
  const errors = [
    ...base.errors,
    ...hardeningIssues.map(issue => issue.message),
  ]
  const valid = base.valid && hardeningIssues.length === 0

  return {
    ...base,
    decision: valid ? 'accept' : 'reject',
    errors,
    issues,
    valid,
  }
}
