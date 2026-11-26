import { NOW_INVALID } from './time.js'

export type VerificationIssueCode =
  | 'assertion.created_at_future'
  | 'assertion.created_at_invalid'
  | 'assertion.created_at_missing'
  | 'assertion.expired'
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
  | 'circle.manifest_field_invalid'
  | 'circle.manifest_invalid'
  | 'circle.manifest_issued_at_future'
  | 'circle.profile_not_allowed'
  | 'circle.revoked'
  | 'circle.superseded'
  | 'circle.unaccepted'
  | 'companion.checked_at_future'
  | 'companion.checked_at_missing'
  | 'companion.failed'
  | 'companion.invalid'
  | 'companion.missing'
  | 'companion.stale'
  | 'companion.subject_mismatch'
  | 'event.publisher_unaccepted'
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
  | 'policy.accepted_publishers_invalid'
  | 'policy.field_invalid'
  | 'policy.max_age_seconds_invalid'
  | 'policy.max_future_seconds_invalid'
  | 'policy.metric_policy_invalid'
  | 'policy.min_distinct_signers_invalid'
  | 'policy.nostr_signature_not_required'
  | 'profile.event_count_invalid'
  | 'profile.field_invalid'
  | 'profile.kind_mismatch'
  | 'profile.subject_format_invalid'
  | 'profile.subject_hint_mismatch'
  | 'profile.subject_mismatch'
  | 'proof.aggregate_mismatch'
  | 'proof.contribution_out_of_bounds'
  | 'proof.invalid'
  | 'proof.threshold_not_met'
  | 'verification.failed'
  | 'verification.now_invalid'

export interface VerificationIssue {
  code: VerificationIssueCode
  message: string
  /**
   * Where in the input the fault is, when it is in one place: such as
   * `event[0]`, `manifest[1]`, `acceptedPublishers[2]` or `bundle.expiresAt`.
   * A fault in a metric is at `event[0].tags.<name>`, and the name is the
   * tag's own, as the event wrote it and unescaped. Show the path or log it;
   * do not parse it.
   */
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
  'assertion.created_at_future': explanation(
    'The assertion is dated further ahead of the verifier clock than the deployment allows.',
    'Reject the assertion. Only its signer sets created_at, and an event dated ahead stays inside the freshness window until that date plus the window. If the verifier clock is right and the publisher is known to run ahead, raise maxFutureSeconds in the deployment policy.',
  ),
  'assertion.created_at_invalid': explanation(
    'The assertion created_at is not a whole number of seconds.',
    'Reject the assertion. A value that is not a Unix timestamp cannot be placed inside the freshness window, so it must not pass as fresh.',
  ),
  'assertion.created_at_missing': explanation(
    'The assertion has no Nostr created_at timestamp.',
    'Fetch or publish a complete signed Nostr event with created_at before applying freshness policy.',
  ),
  'assertion.expired': explanation(
    'The assertion has passed the NIP-40 expiration its publisher set.',
    'Fetch a newer assertion. Its publisher set this one to lapse at that time, and that holds whatever the deployment freshness window allows.',
    'refresh-and-retry',
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
  'circle.manifest_field_invalid': explanation(
    'A field of a circle manifest in the deployment policy is of the wrong type, or one it needs is missing.',
    'Correct the field the issue path names and reissue the bundle. The verifier stops at a malformed field and checks nothing else, so every assertion is rejected until then.',
    'operator-action',
  ),
  'circle.manifest_invalid': explanation(
    'A circle manifest does not match the expected shape or member-derived circle id.',
    'Recreate the manifest with createCircleManifest() from the exact reviewed member pubkeys.',
    'operator-action',
  ),
  'circle.manifest_issued_at_future': explanation(
    'A circle manifest used by the deployment is issued in the future for this verifier.',
    'Check the verifier clock, then retry once the manifest is valid, or reissue it with the right issuedAt.',
    'refresh-and-retry',
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
    'The assertion does not name a circle this deployment accepts.',
    'Reject it. If it names a circle, governance can review that circle and add its manifest or circle id to the deployment policy.',
  ),
  'companion.checked_at_future': explanation(
    'A companion evidence check is timestamped in the future.',
    'Check verifier clock skew and rerun the external resolver or evidence check before accepting the assertion.',
    'refresh-and-retry',
  ),
  'companion.checked_at_missing': explanation(
    'A companion evidence check is missing checkedAt but the policy requires freshness.',
    'Record when the external package, domain, or list check was performed and pass checkedAt to the verifier.',
    'operator-action',
  ),
  'companion.failed': explanation(
    'A required companion evidence check failed.',
    'Do not act on the score until the external package, domain, service, or list check passes under the deployment policy.',
    'manual-review',
  ),
  'companion.invalid': explanation(
    'A companion evidence record or requirement is malformed.',
    'Fix the evidence id, status, subject, and timestamp before using it as deployment evidence. Where the message names maxAgeSeconds, the requirement in the deployment policy is malformed and the evidence is not at fault: correct the requirement and reissue the bundle.',
    'operator-action',
  ),
  'companion.missing': explanation(
    'A required companion evidence check was not supplied.',
    'Run the external resolver, provenance, SBOM, service, or list-revision check required by the deployment policy and pass the result to the verifier.',
    'operator-action',
  ),
  'companion.stale': explanation(
    'A companion evidence check is outside its freshness window.',
    'Refresh the external package, domain, service, or list evidence before accepting the score.',
    'refresh-and-retry',
  ),
  'companion.subject_mismatch': explanation(
    'A companion evidence check was run against a different subject.',
    'Run the external check against the same canonical subject used by the NIP-85 assertion.',
  ),
  'event.publisher_unaccepted': explanation(
    'The assertion was published by a key the deployment policy does not accept.',
    'Reject it. A proof\'s ring signatures are public and carry no time, so anyone can republish a subset of them, or an old proof under a new timestamp, with their own key. Fetch the assertion from an accepted publisher, or add the key to acceptedPublishers only through explicit governance.',
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
  'policy.accepted_publishers_invalid': explanation(
    'The deployment policy names accepted publishers, but the list is empty or malformed.',
    'Re-issue the policy with acceptedPublishers as one or more 64-character lowercase hex pubkeys. Every assertion is rejected until then.',
    'operator-action',
  ),
  'policy.field_invalid': explanation(
    'A field of the deployment policy is of the wrong type, or one it needs is missing.',
    'Correct the field the issue path names and reissue the bundle. The verifier stops at a malformed field and checks nothing else, so every assertion is rejected until then.',
    'operator-action',
  ),
  'policy.max_age_seconds_invalid': explanation(
    'maxAgeSeconds is not a non-negative integer.',
    'Correct maxAgeSeconds where it is set: in the verifier option, the profile, or the deployment policy, reissuing its bundle. A malformed window cannot be applied, so every assertion is rejected until then. Use 0 only to switch the freshness window off on purpose.',
    'operator-action',
  ),
  'policy.max_future_seconds_invalid': explanation(
    'maxFutureSeconds is not a non-negative integer, or is set while the freshness window is off.',
    'Correct maxFutureSeconds where it is set: in the verifier option, or in the deployment policy, reissuing its bundle. With maxAgeSeconds 0 no date is checked, so leave maxFutureSeconds out or give the policy a window. Every assertion is rejected until then.',
    'operator-action',
  ),
  'policy.metric_policy_invalid': explanation(
    'A metric bound in the deployment policy is not a finite number, or its minimum is above its maximum.',
    'Correct the min and max of that entry in metricPolicies and reissue the bundle. A bound that is not a number cannot be applied, so every assertion is rejected until then.',
    'operator-action',
  ),
  'policy.min_distinct_signers_invalid': explanation(
    'minDistinctSigners is not a positive integer.',
    'Correct minDistinctSigners where it is set: in the verifier option, the profile, or the deployment policy, reissuing its bundle. A malformed threshold cannot be applied, so every assertion is rejected until then.',
    'operator-action',
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
  'profile.field_invalid': explanation(
    'A field of the use-case profile is of the wrong type or out of its range, or one it needs is missing.',
    'Correct the field the issue path names, in the profile or in the deployment policy that carries it, and reissue its bundle. The verifier stops at a malformed field and checks nothing else, so every assertion is rejected until then.',
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
  'proof.aggregate_mismatch': explanation(
    'The assertion was published with a different aggregate function from the one the profile or policy requires.',
    'Reject it. The publisher chooses the veil-agg tag, so the same signatures can be republished as a max or a min; fetch the assertion published with the expected aggregate, or change the policy aggregate only through explicit governance.',
  ),
  'proof.contribution_out_of_bounds': explanation(
    'A contribution carries a value outside the bounds the profile or policy sets for one member, or leaves out a metric those bounds require.',
    'Reject it. The aggregator should leave that contribution out and publish again; contributionBoundViolations() finds it before aggregating.',
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
  'verification.now_invalid': explanation(
    'The verifier was given a now that is not a Unix timestamp.',
    'Pass now as Unix seconds, or leave it out to use the current time. Against a value such as NaN every time comparison is false, so nothing would expire or go stale; no time check runs and everything is rejected until it is corrected.',
    'operator-action',
  ),
} satisfies Record<VerificationIssueCode, VerificationIssueExplanationInput>

/** For a code this version does not know, as one a later release added */
const UNKNOWN_ISSUE = explanation(
  'This version of nostr-veil does not know this issue code.',
  'Reject by default, read the result\'s errors, and upgrade nostr-veil to a version that knows the code.',
  'manual-review',
)

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

  const path = message.match(/^(event\[\d+\]|manifest\[\d+\]|trustedPublishers\[\d+\]|acceptedPublishers\[\d+\])/u)?.[1]
  if (path !== undefined) return path

  return undefined
}

// A manifest is named by its place in a policy, in a resolved set, or alone
const MANIFEST_AT = String.raw`(?:circleManifests\[\d+\]|manifest\[\d+\]|manifest)`
const FIELD_MESSAGES: ReadonlyArray<[RegExp, VerificationIssueCode]> = [
  [/^policy must be an object$/u, 'policy.field_invalid'],
  [/^acceptedCircleIds must be a list of strings$/u, 'policy.field_invalid'],
  [/^aggregate must be a string$/u, 'policy.field_invalid'],
  [/^(?:circleManifests|companionEvidence) must be a list$/u, 'policy.field_invalid'],
  [/^companionEvidence\[\d+\] must be an object$/u, 'policy.field_invalid'],
  [/^companionEvidence\[\d+\]\.(?:id|expectedSubject) must be a string$/u, 'policy.field_invalid'],
  [/^companionEvidence\[\d+\]\.required must be true or false$/u, 'policy.field_invalid'],
  [/^(?:expectedSubject|expectedSubjectTagValue) must be a string$/u, 'policy.field_invalid'],
  [/^metricPolicies must be an object$/u, 'policy.field_invalid'],
  [/^(?:allowSupersededCircleIds|rejectUnknownMetrics|requireNostrSignature) must be true or false$/u, 'policy.field_invalid'],
  [/^profile must be an object$/u, 'profile.field_invalid'],
  [/^profile\.id must be a string$/u, 'profile.field_invalid'],
  [/^profile\.kind must be a number$/u, 'profile.field_invalid'],
  [/^profile\.proofVersion must be "v1" or "v2"$/u, 'profile.field_invalid'],
  [/^profile\.subjectTag must be "p", "e", "a" or "k"$/u, 'profile.field_invalid'],
  [/^profile\.(?:subjectTagValue|aggregate) must be a string$/u, 'profile.field_invalid'],
  [/^profile\.metrics\[\d+\]\.contribution must be an object$/u, 'profile.field_invalid'],
  [/^profile\.federation\.requireScope must be true or false$/u, 'profile.field_invalid'],
  [/^profile\.subjectFormats must be a list of strings$/u, 'profile.field_invalid'],
  [/^profile\.metrics must be a list$/u, 'profile.field_invalid'],
  [/^profile\.metrics\[\d+\] must be an object$/u, 'profile.field_invalid'],
  [/^profile\.metrics\[\d+\]\.name must be a string$/u, 'profile.field_invalid'],
  [/^profile\.federation must be an object$/u, 'profile.field_invalid'],
  [/^profile\.federation\.minCircles must be a positive integer$/u, 'profile.field_invalid'],
  [/^manifests must be a list$/u, 'circle.manifest_field_invalid'],
  [new RegExp(`^${MANIFEST_AT} must be an object$`, 'u'), 'circle.manifest_field_invalid'],
  [new RegExp(`^${MANIFEST_AT}\\.(?:members|profileIds|revokedCircleIds|supersedes) must be a list of strings$`, 'u'), 'circle.manifest_field_invalid'],
  [new RegExp(`^${MANIFEST_AT}\\.(?:circleId|name|purpose) must be a string$`, 'u'), 'circle.manifest_field_invalid'],
  [new RegExp(`^${MANIFEST_AT}\\.issuedAt must be a number$`, 'u'), 'circle.manifest_field_invalid'],
]

// A manifest's own messages, alone or as a resolved set names it. The date
// messages come bare from verifyCircleManifest, whose result has no issues.
// The bundle and challenge verifiers prefix theirs, and the builders that
// throw the same words raise no verification error.
const IN_MANIFEST = String.raw`(?:manifest\[\d+\]: )?`
const FAMILY_MESSAGES: ReadonlyArray<[RegExp, VerificationIssueCode]> = [
  [/^event\[\d+\] assertion has expired \(NIP-40 expiration \d+\)$/u, 'assertion.expired'],
  [/^event\[\d+\] missing veil-ring tag$/u, 'proof.invalid'],
  [/^event\[\d+\] (?:missing|duplicate) [depak] tag$/u, 'nip85.syntax_invalid'],
  [new RegExp(`^${IN_MANIFEST}manifest issuedAt is in the future$`, 'u'), 'circle.manifest_issued_at_future'],
  [new RegExp(`^${IN_MANIFEST}(?:manifest version must be 1|manifest (?:name|purpose) must be non-empty|manifest status must be active, revoked, or superseded|(?:issuedAt|expiresAt) must be a non-negative Unix timestamp|expiresAt must be greater than issuedAt)$`, 'u'), 'circle.manifest_invalid'],
  [new RegExp(`^${IN_MANIFEST}supersedes(?:\\[\\d+\\])? (?:must be a 64-character lowercase hex string|must be sorted lexicographically|is duplicated|must contain at least one value)$`, 'u'), 'circle.manifest_invalid'],
  // Two messages of the proof verifier name a circle's members or its id, and
  // the fragment rules below would read them as a fault in a manifest
  [/^event\[\d+\] proof: (?:veil-ring requires at least 2 members|Signature at index \d+ signed message circleId mismatch)$/u, 'proof.invalid'],
  [/^federation: event\[\d+\]: (?:veil-ring requires at least 2 members|Signature at index \d+ signed message circleId mismatch)$/u, 'federation.invalid'],
]

/**
 * The code of a library message that the fragment rules would read wrongly or
 * not at all, matched on the whole message. Each is raised with this code
 * where it is raised.
 */
function familyCodeFromMessage(message: string): VerificationIssueCode | undefined {
  for (const [pattern, code] of FAMILY_MESSAGES) {
    if (pattern.test(message)) return code
  }
  return undefined
}

/**
 * The code of a message about a field of the wrong type, matched on the whole
 * message. Each is raised by the policy, profile or manifest check alone, and
 * only an entry of metricPolicies carries text from the policy: its name, with
 * both ends of the message fixed around it.
 */
function fieldCodeFromMessage(message: string): VerificationIssueCode | undefined {
  for (const [pattern, code] of FIELD_MESSAGES) {
    if (pattern.test(message)) return code
  }
  if (
    message.startsWith('metricPolicies.')
    && (message.endsWith(' must be an object')
      || message.endsWith('.required must be true or false')
      || message.endsWith('.integer must be true or false'))
  ) {
    return 'policy.field_invalid'
  }
  return undefined
}

function codeFromError(message: string): VerificationIssueCode {
  const lower = message.toLowerCase()

  // Matched against the whole message, ahead of the fragment rules below. The
  // syntax, proof and metric messages quote tag names taken from the event,
  // and an event must not be able to name its way into any of these codes.
  if (/^event\[\d+\] assertion created_at is in the future$/u.test(message)) return 'assertion.created_at_future'
  if (/^event\[\d+\] assertion created_at is not a Unix timestamp$/u.test(message)) {
    return 'assertion.created_at_invalid'
  }
  if (message === NOW_INVALID) return 'verification.now_invalid'
  if (message === 'minDistinctSigners must be a positive integer') return 'policy.min_distinct_signers_invalid'
  // The metric name here comes from the policy. An event's own messages open with event[n].
  if (
    message.startsWith('metricPolicies.')
    && (message.endsWith(' must be a finite number') || message.endsWith('.min must be <= max'))
  ) {
    return 'policy.metric_policy_invalid'
  }
  if (message === 'maxAgeSeconds must be a non-negative integer') return 'policy.max_age_seconds_invalid'
  const field = fieldCodeFromMessage(message)
  if (field !== undefined) return field
  const family = familyCodeFromMessage(message)
  if (family !== undefined) return family
  if (
    message === 'maxFutureSeconds must be a non-negative integer'
    || message === 'maxFutureSeconds is set while maxAgeSeconds turns the freshness window off'
  ) {
    return 'policy.max_future_seconds_invalid'
  }

  if (lower.includes('production verifier requires policy.requirenostrsignature')) {
    return 'policy.nostr_signature_not_required'
  }
  if (lower.includes('production verifier requires bundle.expiresat')) return 'bundle.expiry_required'

  if (lower.includes('companion evidence')) {
    if (lower.includes('is missing')) return 'companion.missing'
    if (lower.includes('did not pass')) return 'companion.failed'
    if (lower.includes('subject does not match')) return 'companion.subject_mismatch'
    if (lower.includes('missing checkedat')) return 'companion.checked_at_missing'
    if (lower.includes('checkedat is in the future')) return 'companion.checked_at_future'
    if (lower.includes('freshness window')) return 'companion.stale'
    return 'companion.invalid'
  }

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
  // Matched against the whole message, not a fragment: the syntax, proof and
  // metric messages below quote tag names taken from the event, and an event
  // must not be able to name its way into either of these codes
  if (/^event\[\d+\] publisher is not accepted by deployment policy$/u.test(message)) {
    return 'event.publisher_unaccepted'
  }
  if (/^acceptedPublishers(\[\d+\])? must be /u.test(message)) return 'policy.accepted_publishers_invalid'

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

  // Proof-level policy failures, ahead of the metric checks: their messages name a metric too
  if (lower.includes('veil-agg is "') && lower.includes('is required')) return 'proof.aggregate_mismatch'
  if (
    lower.includes('the contribution minimum')
    || lower.includes('the contribution maximum')
    || lower.includes('the contribution bounds require')
  ) {
    return 'proof.contribution_out_of_bounds'
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

/**
 * Read an issue code out of the words of an error message.
 *
 * For a caller that holds only the strings, such as a log written before
 * results carried `issues`. It is a reading, not a record: a message quotes
 * text from the event, such as a tag name or a kind, and whoever wrote the
 * event can choose words that read as another failure. The verifiers do not
 * use it. Each gives its errors their codes where they are raised, so read
 * `issues` on a verification result and keep this for strings that have none.
 */
export function classifyVerificationError(message: string): VerificationIssue {
  return verificationIssue(codeFromError(message), message, pathFromMessage(message))
}

/** {@link classifyVerificationError} for each message of a list. The same caution applies. */
export function issuesFromErrors(errors: readonly string[]): VerificationIssue[] {
  return errors.map(error => classifyVerificationError(error))
}

export function explainVerificationIssue(
  issueOrCode: VerificationIssue | VerificationIssueCode,
): VerificationIssueExplanation {
  // A result read back from storage can carry anything here
  const code: unknown = typeof issueOrCode === 'object' && issueOrCode !== null
    ? (issueOrCode as { code?: unknown }).code
    : issueOrCode
  // A later release can add a code, and a result it wrote can be read here.
  // Only the table's own keys are codes: toString is a name every object has.
  if (typeof code === 'string' && Object.hasOwn(VERIFICATION_ISSUE_EXPLANATIONS, code)) {
    return VERIFICATION_ISSUE_EXPLANATIONS[code as VerificationIssueCode]
  }
  return Object.freeze({ code: code as VerificationIssueCode, ...UNKNOWN_ISSUE })
}

export function remediationForIssue(issueOrCode: VerificationIssue | VerificationIssueCode): string {
  return explainVerificationIssue(issueOrCode).remediation
}
