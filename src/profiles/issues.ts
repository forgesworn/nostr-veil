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
