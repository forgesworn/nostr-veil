import { eventShapeProblem } from '../nip85/shape.js'
import { isAuthenticBundle } from './authentic.js'
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
  | 'event-publisher'
  | 'circle-policy'
  | 'companion-evidence'
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
  proofClaims: readonly string[]
  proofLimitations: readonly string[]
  recommendedActions: readonly string[]
  requiredControls: readonly {
    risk: string
    control: string
  }[]
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

/** The controls that report what the policy inside the bundle asks for. */
const POLICY_CONTROLS: ReadonlySet<ProductionControlId> = new Set<ProductionControlId>([
  'event-signatures',
  'event-publisher',
  'circle-policy',
  'companion-evidence',
  'profile-subject',
  'proof-threshold',
  'metric-policy',
])
const POLICY_NOT_APPLIED = 'The deployment bundle is not authentic, so its policy was not applied and this was not checked.'
const ASSERTION_UNREADABLE = 'An assertion is too malformed to read, so this could not be checked.'

/**
 * Read as an object a value that may not be one. A report is built from what
 * the verifier was handed, and a bundle that is not authentic can hold
 * anything.
 */
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
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
  const bundleHasExpiry = record(result.bundle.bundle).expiresAt !== undefined
  const bundleFreshnessFailed = hasAny(codes, [
    'bundle.expired',
    'bundle.expires_at_invalid',
    'bundle.expiry_required',
    'bundle.issued_at_future',
    'bundle.issued_at_invalid',
  ])
  // The policy code comes first. Naming publishers forces the signature check,
  // so a hand-built policy can have its signatures checked without requiring
  // them, and the production verifier still rejects it for that.
  const eventSignatureStatus: ProductionControlStatus = codes.has('policy.nostr_signature_not_required')
    ? 'fail'
    : signatureChecked
      ? (result.deployment.nostrSignatures.valid ? 'pass' : 'fail')
      : 'not-checked'
  // Absent from a result that an earlier release produced or stored as JSON
  const publishers: { checked: boolean; valid: boolean } | undefined = result.deployment.publishers
  const eventPublisherStatus: ProductionControlStatus = publishers?.checked === true
    ? (publishers.valid ? 'pass' : 'fail')
    : 'not-checked'
  const bundleFreshnessStatus: ProductionControlStatus = bundleFreshnessFailed
    ? 'fail'
    : (bundleHasExpiry ? 'pass' : 'not-checked')
  const companionEvidenceRequired = result.deployment.companionEvidence.requirements.some(requirement => requirement.required !== false)
  const companionEvidenceChecked = result.deployment.companionEvidence.evidence.length > 0
  const companionEvidenceStatus: ProductionControlStatus = hasPrefix(codes, 'companion.')
    ? 'fail'
    : (companionEvidenceRequired || companionEvidenceChecked ? 'pass' : 'not-checked')
  // An assertion too malformed to read had nothing in it for these checks to
  // read, so none of them can be said to have passed
  const unreadable = result.deployment.profileVerification.events
    .some(item => eventShapeProblem(item.event) !== undefined)
  const circleFailed = hasPrefix(codes, 'circle.')
  const proofFailed = hasPrefix(codes, 'proof.') || hasPrefix(codes, 'federation.') || hasPrefix(codes, 'assertion.')
  const metricFailed = hasPrefix(codes, 'metric.')

  const controls = [
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
      'event-publisher',
      'Accepted event publisher',
      eventPublisherStatus,
      eventPublisherStatus === 'pass'
        ? 'Every checked assertion was signed by a publisher key the deployment policy accepts.'
        : eventPublisherStatus === 'not-checked'
          ? (publishers === undefined
              ? 'This result records no publisher check, so the report cannot say who published the assertions.'
              : 'This deployment policy names no accepted publishers, so anyone can republish a subset of a proof\'s signatures, or an old proof under a new timestamp, with their own key.')
          : 'At least one assertion was not signed by an accepted publisher key, or the policy\'s list of accepted publishers is malformed.',
    ),
    control(
      'circle-policy',
      'Accepted circle policy',
      circleFailed || unreadable ? 'fail' : 'pass',
      circleFailed
        ? 'The assertion used a circle that is missing, malformed, expired, revoked, superseded, unaccepted, or not allowed for this profile.'
        : unreadable
          ? ASSERTION_UNREADABLE
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
      proofFailed || unreadable ? 'fail' : 'pass',
      proofFailed
        ? 'The proof, federation, threshold, or assertion freshness check failed.'
        : unreadable
          ? ASSERTION_UNREADABLE
          : 'The nostr-veil proof, signer threshold, federation policy, and assertion freshness checks passed.',
    ),
    control(
      'metric-policy',
      'Metric policy',
      metricFailed || unreadable ? 'fail' : 'pass',
      metricFailed
        ? 'At least one metric is missing, unexpected, non-numeric, non-integer, or outside the deployment bounds.'
        : unreadable
          ? ASSERTION_UNREADABLE
          : 'The published metrics satisfy the deployment metric policy.',
    ),
    control(
      'companion-evidence',
      'Companion evidence',
      companionEvidenceStatus,
      companionEvidenceStatus === 'pass'
        ? 'Configured companion evidence passed for the same subject inside the deployment freshness window.'
        : companionEvidenceStatus === 'not-checked'
          ? 'This deployment policy did not require companion evidence checks outside the nostr-veil proof.'
          : 'A required companion evidence check is missing, failed, stale, malformed, or for the wrong subject.',
    ),
  ]

  // The policy of a bundle that is not authentic was not applied, so nothing
  // it asks for was checked, and no control may say that it passed or failed
  return Object.freeze(isAuthenticBundle(result.bundle)
    ? controls
    : controls.map(item => POLICY_CONTROLS.has(item.id)
      ? control(item.id, item.label, 'not-checked', POLICY_NOT_APPLIED)
      : item))
}

/**
 * The profile as the bundle states it, echoed and not interpreted. Where the
 * policy was not applied this is what a bundle that is not authentic says of
 * itself, and it need not be an object, nor its lists be lists.
 */
function profileSummary(given: unknown): ProductionDecisionProfileSummary {
  const profile = record(given) as Partial<UseCaseProfile>

  return Object.freeze({
    id: profile.id,
    title: profile.title,
    status: profile.status,
    kind: profile.kind,
    subjectTag: profile.subjectTag,
    ...(profile.subjectTagValue === undefined ? {} : { subjectTagValue: profile.subjectTagValue }),
    subjectFormats: Object.freeze([...list(profile.subjectFormats)]),
    proofVersion: profile.proofVersion,
    proofClaims: Object.freeze([...list(profile.proofClaims)]),
    proofLimitations: Object.freeze([...list(profile.proofLimitations)]),
    recommendedActions: Object.freeze([...list(profile.recommendedActions)]),
    requiredControls: Object.freeze(list(profile.requiredControls).map(item => Object.freeze({ ...record(item) }))),
  }) as ProductionDecisionProfileSummary
}

function bundleSummary(result: ProductionDeploymentVerification): ProductionDecisionBundleSummary {
  // Echoed as it was handed in, which need not be an object
  const bundle = record(result.bundle.bundle) as Partial<ProductionDecisionBundleSummary>

  return Object.freeze({
    id: bundle.id,
    signer: bundle.signer,
    issuedAt: bundle.issuedAt,
    ...(bundle.expiresAt === undefined ? {} : { expiresAt: bundle.expiresAt }),
    publisherTrusted: result.bundle.publisherTrusted,
    signatureValid: result.bundle.signatureValid,
  }) as ProductionDecisionBundleSummary
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
    profile: profileSummary(record(result.deployment.policy).profile),
    policyId: record(result.deployment.policy).id as string,
    subject: record(result.deployment.policy).expectedSubject as string,
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
