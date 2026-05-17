export type VerificationIssueCode =
  | 'assertion.created_at_missing'
  | 'assertion.stale'
  | 'bundle.expired'
  | 'bundle.expires_at_invalid'
  | 'bundle.expiry_required'
  | 'bundle.id_invalid'
  | 'bundle.issued_at_future'
  | 'bundle.issued_at_invalid'
  | 'bundle.signature_invalid'
  | 'bundle.signature_malformed'
  | 'bundle.signer_invalid'
  | 'bundle.signer_untrusted'
  | 'bundle.trusted_publisher_invalid'
  | 'bundle.trusted_publishers_missing'
  | 'bundle.type_invalid'
  | 'bundle.version_invalid'
  | 'circle.accepted_invalid'
  | 'circle.accepted_missing'
  | 'circle.manifest_expired'
  | 'circle.manifest_invalid'
  | 'circle.profile_not_allowed'
  | 'circle.revoked'
  | 'circle.superseded'
  | 'circle.unaccepted'
  | 'event.signature_invalid'
  | 'event.signature_missing'
  | 'federation.invalid'
  | 'federation.threshold_not_met'
  | 'metric.above_max'
  | 'metric.below_min'
  | 'metric.integer_required'
  | 'metric.invalid_value'
  | 'metric.required_missing'
  | 'metric.unknown'
  | 'nip85.syntax_invalid'
  | 'policy.nostr_signature_not_required'
  | 'profile.event_count_invalid'
  | 'profile.kind_mismatch'
  | 'profile.subject_format_invalid'
  | 'profile.subject_hint_mismatch'
  | 'profile.subject_mismatch'
  | 'proof.invalid'
  | 'proof.threshold_not_met'
  | 'verification.failed'

export interface VerificationIssue {
  code: VerificationIssueCode
  message: string
  path?: string
}

export type VerificationIssueAction =
  | 'reject'
  | 'manual-review'
  | 'operator-action'
  | 'refresh-and-retry'

export interface VerificationIssueExplanation {
  code: VerificationIssueCode
  summary: string
  remediation: string
  action: VerificationIssueAction
}

type VerificationIssueExplanationInput = Omit<VerificationIssueExplanation, 'code'>

function explanation(
  summary: string,
  remediation: string,
  action: VerificationIssueAction = 'reject',
): VerificationIssueExplanationInput {
  return { summary, remediation, action }
}

const VERIFICATION_ISSUE_EXPLANATION_INPUTS = {
  'assertion.created_at_missing': explanation(
    'The assertion has no Nostr created_at timestamp.',
    'Fetch or publish a complete signed Nostr event with created_at before applying freshness policy.',
  ),
  'assertion.stale': explanation(
    'The assertion is outside the deployment freshness window.',
    'Fetch a newer assertion, shorten cache lifetime, or change maxAgeSeconds only if the deployment policy intentionally accepts older evidence.',
    'refresh-and-retry',
  ),
  'bundle.expired': explanation(
    'The signed deployment bundle has expired.',
    'Fetch the current signed bundle from the trusted publisher or rotate the bundle before accepting assertions.',
    'refresh-and-retry',
  ),
  'bundle.expires_at_invalid': explanation(
    'The bundle expiresAt field is malformed.',
    'Re-issue the bundle with expiresAt as a Unix timestamp later than issuedAt.',
    'operator-action',
  ),
  'bundle.expiry_required': explanation(
    'The production verifier requires signed bundles to expire.',
    'Set expiresAt when calling createSignedDeploymentBundle(), then publish the replacement bundle.',
    'operator-action',
  ),
  'bundle.id_invalid': explanation(
    'The bundle id is missing or malformed.',
    'Use a stable non-empty deployment id when creating the signed bundle.',
    'operator-action',
  ),
  'bundle.issued_at_future': explanation(
    'The bundle issuedAt timestamp is in the future for this verifier.',
    'Check verifier clock skew, then re-issue or retry once the bundle is valid.',
    'refresh-and-retry',
  ),
  'bundle.issued_at_invalid': explanation(
    'The bundle issuedAt field is malformed.',
    'Re-issue the bundle with issuedAt as a valid Unix timestamp.',
    'operator-action',
  ),
  'bundle.signature_invalid': explanation(
    'The signed deployment bundle was changed after signing or signed with the wrong key.',
    'Reject the bundle and fetch a fresh copy from the trusted publisher; rotate keys if compromise is suspected.',
  ),
  'bundle.signature_malformed': explanation(
    'The bundle signature is not a valid Schnorr signature encoding.',
    'Re-issue the bundle with createSignedDeploymentBundle() and reject the malformed bundle.',
    'operator-action',
  ),
  'bundle.signer_invalid': explanation(
    'The bundle signer pubkey is malformed.',
    'Re-issue the bundle with a valid 32-byte hex publisher key.',
    'operator-action',
  ),
  'bundle.signer_untrusted': explanation(
    'The bundle signer is not in the trusted publisher set.',
    'Reject the bundle unless governance has explicitly added this publisher key to trustedPublishers.',
  ),
  'bundle.trusted_publisher_invalid': explanation(
    'A configured trusted publisher key is malformed.',
    'Fix the trustedPublishers configuration so every entry is a valid 32-byte hex pubkey.',
    'operator-action',
  ),
  'bundle.trusted_publishers_missing': explanation(
    'No trusted bundle publisher keys were configured.',
    'Pass trustedPublishers to the verifier and pin the operator keys your deployment actually trusts.',
    'operator-action',
  ),
  'bundle.type_invalid': explanation(
    'The bundle type field is not recognised.',
    'Fetch or generate a deployment-policy bundle with createSignedDeploymentBundle().',
    'operator-action',
  ),
  'bundle.version_invalid': explanation(
    'The bundle version is not supported by this verifier.',
    'Upgrade the verifier or publish a bundle version supported by this deployment.',
    'operator-action',
  ),
  'circle.accepted_invalid': explanation(
    'An accepted circle id in verifier configuration is malformed.',
    'Use createCircleManifest() or a valid 64-character circle id from the reviewed member list.',
    'operator-action',
  ),
  'circle.accepted_missing': explanation(
    'The deployment has no accepted circles configured.',
    'Configure reviewed circle manifests or acceptedCircleIds before acting on assertions.',
    'operator-action',
  ),
  'circle.manifest_expired': explanation(
    'A circle manifest used by the deployment has expired.',
    'Rotate the circle manifest, publish a replacement, and verify the assertion against the current manifest.',
    'refresh-and-retry',
  ),
  'circle.manifest_invalid': explanation(
    'A circle manifest does not match the expected shape or member-derived circle id.',
    'Recreate the manifest with createCircleManifest() from the exact reviewed member pubkeys.',
    'operator-action',
  ),
  'circle.profile_not_allowed': explanation(
    'The circle manifest does not allow this use-case profile.',
    'Use a circle manifest whose profileIds includes this profile, or route the assertion to a policy that accepts the circle for this use case.',
    'operator-action',
  ),
  'circle.revoked': explanation(
    'The assertion uses a circle that the deployment has revoked.',
    'Reject the assertion and require a fresh assertion from an active, non-revoked circle.',
  ),
  'circle.superseded': explanation(
    'The assertion uses a circle superseded by a newer manifest.',
    'Fetch an assertion from the replacement circle, or explicitly allow superseded circles only for historical verification.',
    'refresh-and-retry',
  ),
  'circle.unaccepted': explanation(
    'The assertion was produced by a circle this deployment does not accept.',
    'Reject it unless governance reviews the circle and adds its manifest or circle id to the deployment policy.',
  ),
  'event.signature_invalid': explanation(
    'The fetched Nostr event id or signature is invalid.',
    'Reject the event, fetch it again from another relay if useful, and do not verify or act on mutated event data.',
  ),
  'event.signature_missing': explanation(
    'The verifier expected a fully signed Nostr event but received an unsigned template.',
    'Sign assertions before publishing and require relay-fetched events to include id, pubkey, created_at, and sig.',
  ),
  'federation.invalid': explanation(
    'The federated proof set failed federation validation.',
    'Ensure all events share the expected subject and scope, then verify only complete events from accepted circles.',
  ),
  'federation.threshold_not_met': explanation(
    'The federation has too few accepted circles or distinct signers.',
    'Collect more valid assertions from accepted circles or lower the threshold only through an explicit policy change.',
    'manual-review',
  ),
  'metric.above_max': explanation(
    'A metric is above the deployment maximum.',
    'Reject or manually review the assertion; update metric bounds only if the profile definition has changed.',
    'manual-review',
  ),
  'metric.below_min': explanation(
    'A metric is below the deployment minimum.',
    'Treat the score as failing the gate, or route it to the fallback/manual-review path defined by the application.',
    'manual-review',
  ),
  'metric.integer_required': explanation(
    'A metric must be an integer for this deployment.',
    'Publish integer metric values or relax the metric policy only if fractional values are intentionally supported.',
    'operator-action',
  ),
  'metric.invalid_value': explanation(
    'A metric value is not a finite number.',
    'Reject the assertion and require the publisher to emit numeric NIP-85 metric tags.',
  ),
  'metric.required_missing': explanation(
    'A required metric is missing from the assertion.',
    'Require the aggregate assertion to include the metric named in the deployment policy before acting on it.',
    'manual-review',
  ),
  'metric.unknown': explanation(
    'The assertion contains a metric not allowed by the deployment policy.',
    'Reject unknown metrics or update the policy after reviewing the metric meaning and bounds.',
    'manual-review',
  ),
  'nip85.syntax_invalid': explanation(
    'The event does not pass NIP-85 syntax validation.',
    'Reject the event and publish it again with the correct kind, tags, subject hint, and metric tag shape.',
  ),
  'policy.nostr_signature_not_required': explanation(
    'The production bundle policy would allow unsigned relay events.',
    'Set requireNostrSignature: true in createDeploymentPolicy() for production relay-fetched assertions.',
    'operator-action',
  ),
  'profile.event_count_invalid': explanation(
    'The number of events does not match the selected profile.',
    'Pass exactly one event for single-assertion profiles, or the complete scoped event set for federation profiles.',
    'operator-action',
  ),
  'profile.kind_mismatch': explanation(
    'The event kind does not match the selected profile.',
    'Route the event to the matching NIP-85 profile, or rebuild the assertion with the profile-required kind.',
  ),
  'profile.subject_format_invalid': explanation(
    'The subject string does not match the profile subject format.',
    'Canonicalise the subject with the profile helper before contribution and verification.',
    'operator-action',
  ),
  'profile.subject_hint_mismatch': explanation(
    'The subject hint tag value does not match the profile policy.',
    'Use the expected p, e, a, or k tag value and require proof v2 for workflows that rely on subject binding.',
  ),
  'profile.subject_mismatch': explanation(
    'The assertion is about a different subject than the deployment expected.',
    'Reject it and verify only assertions whose subject equals the canonical expectedSubject.',
  ),
  'proof.invalid': explanation(
    'The nostr-veil ring proof is invalid.',
    'Reject the assertion; collect a new aggregate from the circle rather than trying to repair proof tags.',
  ),
  'proof.threshold_not_met': explanation(
    'The proof has fewer distinct signers than the deployment requires.',
    'Collect more valid contributions from the circle or change the threshold only through explicit governance.',
    'manual-review',
  ),
  'verification.failed': explanation(
    'Verification failed with an unclassified error.',
    'Reject by default, inspect result.errors, and add a more specific issue mapping if this becomes a supported failure mode.',
    'manual-review',
  ),
} satisfies Record<VerificationIssueCode, VerificationIssueExplanationInput>

export const VERIFICATION_ISSUE_EXPLANATIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(VERIFICATION_ISSUE_EXPLANATION_INPUTS).map(([code, value]) => [
      code,
      Object.freeze({ code: code as VerificationIssueCode, ...value }),
    ]),
  ),
) as Readonly<Record<VerificationIssueCode, VerificationIssueExplanation>>

export function verificationIssue(
  code: VerificationIssueCode,
  message: string,
  path?: string,
): VerificationIssue {
  return Object.freeze({
    code,
    message,
    ...(path === undefined ? {} : { path }),
  })
}

function pathFromMessage(message: string): string | undefined {
  const metric = message.match(/^(event\[\d+\]) metric "([^"]+)"/u)
  if (metric !== null) return `${metric[1]}.tags.${metric[2]}`

  const path = message.match(/^(event\[\d+\]|manifest\[\d+\]|trustedPublishers\[\d+\])/u)?.[1]
  if (path !== undefined) return path

  return undefined
}

function codeFromError(message: string): VerificationIssueCode {
  const lower = message.toLowerCase()

  if (lower.includes('production verifier requires policy.requirenostrsignature')) {
    return 'policy.nostr_signature_not_required'
  }
  if (lower.includes('production verifier requires bundle.expiresat')) return 'bundle.expiry_required'

  if (lower.includes('no trusted bundle publishers configured')) return 'bundle.trusted_publishers_missing'
  if (lower.includes('trustedpublishers[')) return 'bundle.trusted_publisher_invalid'
  if (lower.includes('bundle signer is not trusted')) return 'bundle.signer_untrusted'
  if (lower.includes('bundle signature is invalid')) return 'bundle.signature_invalid'
  if (lower.includes('bundle signature must be')) return 'bundle.signature_malformed'
  if (lower.includes('bundle signer must be')) return 'bundle.signer_invalid'
  if (lower.includes('bundle is expired')) return 'bundle.expired'
  if (lower.includes('bundle issuedat is in the future')) return 'bundle.issued_at_future'
  if (lower.includes('bundle issuedat')) return 'bundle.issued_at_invalid'
  if (lower.includes('bundle expiresat')) return 'bundle.expires_at_invalid'
  if (lower.includes('bundle id')) return 'bundle.id_invalid'
  if (lower.includes('bundle type')) return 'bundle.type_invalid'
  if (lower.includes('bundle version')) return 'bundle.version_invalid'

  if (lower.includes('is not a fully signed nostr event')) return 'event.signature_missing'
  if (lower.includes('nostr event signature is invalid')) return 'event.signature_invalid'

  if (lower.includes('no accepted circle ids were supplied')) return 'circle.accepted_missing'
  if (lower.includes('acceptedcircleids')) return 'circle.accepted_invalid'
  if (lower.includes('circle is not accepted')) return 'circle.unaccepted'
  if (lower.includes('manifest circle is revoked') || lower.includes('manifest is revoked')) return 'circle.revoked'
  if (lower.includes('manifest is expired')) return 'circle.manifest_expired'
  if (lower.includes('manifest is superseded')) return 'circle.superseded'
  if (lower.includes('manifest does not allow profile')) return 'circle.profile_not_allowed'
  if (lower.includes('circleid') || lower.includes('members') || lower.includes('profileids')) {
    return 'circle.manifest_invalid'
  }

  if (lower.includes('metric "') && lower.includes('is not allowed')) return 'metric.unknown'
  if (lower.includes('missing required metric')) return 'metric.required_missing'
  if (lower.includes('is not a finite number')) return 'metric.invalid_value'
  if (lower.includes('must be an integer')) return 'metric.integer_required'
  if (lower.includes('below deployment minimum')) return 'metric.below_min'
  if (lower.includes('above deployment maximum')) return 'metric.above_max'

  if (lower.includes('syntax:')) return 'nip85.syntax_invalid'
  if (lower.includes('does not match profile kind')) return 'profile.kind_mismatch'
  if (lower.includes('subject does not match expected subject')) return 'profile.subject_mismatch'
  if (lower.includes('subject does not match profile formats')) return 'profile.subject_format_invalid'
  if (lower.includes('tag does not match expected subject hint')) return 'profile.subject_hint_mismatch'
  if (lower.includes('profile expects exactly one') || lower.includes('profile verification requires')) {
    return 'profile.event_count_invalid'
  }

  if (lower.includes('federation has fewer than')) return 'federation.threshold_not_met'
  if (lower.includes('federation')) return 'federation.invalid'
  if (lower.includes('proof:')) return 'proof.invalid'
  if (lower.includes('fewer than') && lower.includes('distinct signers')) return 'proof.threshold_not_met'
  if (lower.includes('missing created_at')) return 'assertion.created_at_missing'
  if (lower.includes('freshness window')) return 'assertion.stale'

  return 'verification.failed'
}

export function classifyVerificationError(message: string): VerificationIssue {
  return verificationIssue(codeFromError(message), message, pathFromMessage(message))
}

export function issuesFromErrors(errors: readonly string[]): VerificationIssue[] {
  return errors.map(error => classifyVerificationError(error))
}

export function explainVerificationIssue(
  issueOrCode: VerificationIssue | VerificationIssueCode,
): VerificationIssueExplanation {
  const code = typeof issueOrCode === 'string' ? issueOrCode : issueOrCode.code
  return VERIFICATION_ISSUE_EXPLANATIONS[code]
}

export function remediationForIssue(issueOrCode: VerificationIssue | VerificationIssueCode): string {
  return explainVerificationIssue(issueOrCode).remediation
}
