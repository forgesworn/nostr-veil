import { explainVerificationIssue } from './issues.js'
import { verifyProductionDeployment } from './production.js'
import type { EventTemplate } from '../nip85/types.js'
import type { SignedDeploymentBundle } from './bundle.js'
import type {
  VerificationIssue,
  VerificationIssueAction,
  VerificationIssueExplanation,
} from './issues.js'
import type {
  ProductionDeploymentVerification,
  VerifyProductionDeploymentOptions,
} from './production.js'
import type { UseCaseProfile } from './types.js'

export type ProductionDecisionRecommendedAction = VerificationIssueAction | 'accept'

export type ProductionControlStatus = 'pass' | 'fail' | 'not-checked'

export type ProductionControlId =
  | 'bundle-publisher'
  | 'bundle-signature'
  | 'bundle-freshness'
  | 'event-signatures'
  | 'circle-policy'
  | 'profile-subject'
  | 'proof-threshold'
  | 'metric-policy'

export interface ProductionDecisionIssue extends VerificationIssue, VerificationIssueExplanation {}

export interface ProductionControlReport {
  id: ProductionControlId
  label: string
  status: ProductionControlStatus
  summary: string
}

export interface ProductionDecisionProfileSummary {
  id: string
  title: string
  status: UseCaseProfile['status']
  kind: number
  subjectTag: UseCaseProfile['subjectTag']
  subjectTagValue?: string
  subjectFormats: readonly UseCaseProfile['subjectFormats'][number][]
  proofVersion: UseCaseProfile['proofVersion']
}

export interface ProductionDecisionBundleSummary {
  id: string
  signer: string
  issuedAt: number
  expiresAt?: number
  publisherTrusted: boolean
  signatureValid: boolean
}

export interface ProductionDecisionReport {
  decision: ProductionDeploymentVerification['decision']
  valid: boolean
  recommendedAction: ProductionDecisionRecommendedAction
  bundle: ProductionDecisionBundleSummary
  profile: ProductionDecisionProfileSummary
  policyId: string
  subject: string
  metrics: Readonly<Record<string, readonly number[]>>
  controls: readonly ProductionControlReport[]
  issues: readonly ProductionDecisionIssue[]
  remediations: readonly string[]
}

const ACTION_PRIORITY: Record<ProductionDecisionRecommendedAction, number> = {
  accept: 0,
  reject: 1,
  'manual-review': 2,
  'refresh-and-retry': 3,
  'operator-action': 4,
}

function decisionIssue(issue: VerificationIssue): ProductionDecisionIssue {
  const explanation = explainVerificationIssue(issue)

  return Object.freeze({
    ...issue,
    summary: explanation.summary,
    remediation: explanation.remediation,
    action: explanation.action,
  })
}

function recommendedAction(
  valid: boolean,
  issues: readonly ProductionDecisionIssue[],
): ProductionDecisionRecommendedAction {
  if (valid && issues.length === 0) return 'accept'
  if (issues.length === 0) return 'reject'

  return issues.reduce<ProductionDecisionRecommendedAction>((strongest, issue) => {
    return ACTION_PRIORITY[issue.action] > ACTION_PRIORITY[strongest] ? issue.action : strongest
  }, 'reject')
}

function uniqueRemediations(issues: readonly ProductionDecisionIssue[]): readonly string[] {
  return Object.freeze([...new Set(issues.map(issue => issue.remediation))])
}

function issueCodeSet(issues: readonly ProductionDecisionIssue[]): ReadonlySet<string> {
  return new Set(issues.map(issue => issue.code))
}

function hasPrefix(codes: ReadonlySet<string>, prefix: string): boolean {
  return [...codes].some(code => code.startsWith(prefix))
}

function hasAny(codes: ReadonlySet<string>, candidates: readonly string[]): boolean {
  return candidates.some(code => codes.has(code))
}

function control(
  id: ProductionControlId,
  label: string,
  status: ProductionControlStatus,
  summary: string,
): ProductionControlReport {
  return Object.freeze({ id, label, status, summary })
}

function statusFromIssues(
  codes: ReadonlySet<string>,
  candidates: readonly string[],
): ProductionControlStatus {
  return hasAny(codes, candidates) ? 'fail' : 'pass'
}

function productionControls(result: ProductionDeploymentVerification, issues: readonly ProductionDecisionIssue[]): readonly ProductionControlReport[] {
  const codes = issueCodeSet(issues)
  const signatureChecked = result.deployment.nostrSignatures.checked
  const bundleHasExpiry = result.bundle.bundle.expiresAt !== undefined
  const bundleFreshnessFailed = hasAny(codes, [
    'bundle.expired',
    'bundle.expires_at_invalid',
    'bundle.expiry_required',
    'bundle.issued_at_future',
    'bundle.issued_at_invalid',
  ])
  const eventSignatureStatus: ProductionControlStatus = signatureChecked
    ? (result.deployment.nostrSignatures.valid ? 'pass' : 'fail')
    : (codes.has('policy.nostr_signature_not_required') ? 'fail' : 'not-checked')
  const bundleFreshnessStatus: ProductionControlStatus = bundleFreshnessFailed
    ? 'fail'
    : (bundleHasExpiry ? 'pass' : 'not-checked')

  return Object.freeze([
    control(
      'bundle-publisher',
      'Trusted bundle publisher',
      result.bundle.publisherTrusted ? 'pass' : 'fail',
      result.bundle.publisherTrusted
        ? 'The signed deployment bundle came from a configured trusted publisher key.'
        : 'The verifier cannot tie this bundle to a configured trusted publisher key.',
    ),
    control(
      'bundle-signature',
      'Bundle signature',
      result.bundle.signatureValid ? 'pass' : 'fail',
      result.bundle.signatureValid
        ? 'The deployment bundle signature verifies against the bundle signer.'
        : 'The deployment bundle signature is malformed, invalid, or does not match the payload.',
    ),
    control(
      'bundle-freshness',
      'Bundle freshness',
      bundleFreshnessStatus,
      bundleFreshnessStatus === 'pass'
        ? 'The deployment bundle is time-bounded and valid for this verification time.'
        : bundleFreshnessStatus === 'not-checked'
          ? 'Bundle expiry was explicitly relaxed, so this report cannot prove the bundle is time-bounded.'
          : 'The deployment bundle is missing required expiry metadata, expired, or outside its valid time window.',
    ),
    control(
      'event-signatures',
      'Relay event signatures',
      eventSignatureStatus,
      eventSignatureStatus === 'pass'
        ? 'Every checked relay-fetched assertion has a valid Nostr event id and signature.'
        : eventSignatureStatus === 'not-checked'
          ? 'Relay event signature verification was explicitly relaxed for this deployment.'
          : 'At least one relay-fetched assertion is unsigned, mutated, or the policy does not require signed events.',
    ),
    control(
      'circle-policy',
      'Accepted circle policy',
      hasPrefix(codes, 'circle.') ? 'fail' : 'pass',
      hasPrefix(codes, 'circle.')
        ? 'The assertion used a circle that is missing, malformed, expired, revoked, superseded, unaccepted, or not allowed for this profile.'
        : 'The assertion was produced by a circle accepted by the deployment policy.',
    ),
    control(
      'profile-subject',
      'Profile and subject binding',
      statusFromIssues(codes, [
        'profile.event_count_invalid',
        'profile.kind_mismatch',
        'profile.subject_format_invalid',
        'profile.subject_hint_mismatch',
        'profile.subject_mismatch',
        'nip85.syntax_invalid',
      ]),
      hasAny(codes, [
        'profile.event_count_invalid',
        'profile.kind_mismatch',
        'profile.subject_format_invalid',
        'profile.subject_hint_mismatch',
        'profile.subject_mismatch',
        'nip85.syntax_invalid',
      ])
        ? 'The assertion does not match the expected profile shape, subject, subject hint, or NIP-85 syntax.'
        : 'The assertion matches the profile kind, canonical subject, subject hint, and NIP-85 syntax policy.',
    ),
    control(
      'proof-threshold',
      'Proof and threshold',
      hasPrefix(codes, 'proof.') || hasPrefix(codes, 'federation.') || hasPrefix(codes, 'assertion.')
        ? 'fail'
        : 'pass',
      hasPrefix(codes, 'proof.') || hasPrefix(codes, 'federation.') || hasPrefix(codes, 'assertion.')
        ? 'The proof, federation, threshold, or assertion freshness check failed.'
        : 'The nostr-veil proof, signer threshold, federation policy, and assertion freshness checks passed.',
    ),
    control(
      'metric-policy',
      'Metric policy',
      hasPrefix(codes, 'metric.') ? 'fail' : 'pass',
      hasPrefix(codes, 'metric.')
        ? 'At least one metric is missing, unexpected, non-numeric, non-integer, or outside the deployment bounds.'
        : 'The published metrics satisfy the deployment metric policy.',
    ),
  ])
}

function profileSummary(profile: UseCaseProfile): ProductionDecisionProfileSummary {
  return Object.freeze({
    id: profile.id,
    title: profile.title,
    status: profile.status,
    kind: profile.kind,
    subjectTag: profile.subjectTag,
    ...(profile.subjectTagValue === undefined ? {} : { subjectTagValue: profile.subjectTagValue }),
    subjectFormats: Object.freeze([...profile.subjectFormats]),
    proofVersion: profile.proofVersion,
  })
}

function bundleSummary(result: ProductionDeploymentVerification): ProductionDecisionBundleSummary {
  return Object.freeze({
    id: result.bundle.bundle.id,
    signer: result.bundle.bundle.signer,
    issuedAt: result.bundle.bundle.issuedAt,
    ...(result.bundle.bundle.expiresAt === undefined ? {} : { expiresAt: result.bundle.bundle.expiresAt }),
    publisherTrusted: result.bundle.publisherTrusted,
    signatureValid: result.bundle.signatureValid,
  })
}

/**
 * Convert a production verification result into an audit- and UI-ready report.
 *
 * The report preserves the verifier decision, adds stable remediation guidance,
 * and names the production controls that passed, failed, or were explicitly
 * relaxed. It does not change the underlying verification semantics.
 */
export function createProductionDecisionReport(
  result: ProductionDeploymentVerification,
): ProductionDecisionReport {
  const issues = Object.freeze(result.issues.map(decisionIssue))

  return Object.freeze({
    decision: result.decision,
    valid: result.valid,
    recommendedAction: recommendedAction(result.valid, issues),
    bundle: bundleSummary(result),
    profile: profileSummary(result.deployment.policy.profile),
    policyId: result.deployment.policy.id,
    subject: result.deployment.policy.expectedSubject,
    metrics: result.deployment.metrics,
    controls: productionControls(result, issues),
    issues,
    remediations: uniqueRemediations(issues),
  })
}

/**
 * Verify a production deployment and return the decision report directly.
 */
export function verifyProductionDeploymentReport(
  events: EventTemplate | readonly EventTemplate[],
  bundle: SignedDeploymentBundle,
  options: VerifyProductionDeploymentOptions = {},
): ProductionDecisionReport {
  return createProductionDecisionReport(verifyProductionDeployment(events, bundle, options))
}
