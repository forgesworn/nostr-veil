import { isFullyReadable } from '../nip85/shape.js'
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
/** The controls that are checks made on each assertion event. */
const EVENT_CONTROLS: ReadonlySet<ProductionControlId> = new Set<ProductionControlId>([
  'event-signatures',
  'event-publisher',
  'circle-policy',
  'proof-threshold',
  'metric-policy',
])
const NO_ASSERTION = 'No assertion was supplied, so there was nothing for this to check.'
/**
 * What the report says of a policy that was not applied: nothing. It is not
 * the operator's, so none of it is read back to them. The empty strings stand
 * in for values the profile summary has no "none" for.
 */
const BLANK_PROFILE = Object.freeze({
  id: '',
  title: '',
  status: '',
  kind: 0,
  subjectTag: '',
  subjectFormats: Object.freeze([]),
  proofVersion: '',
  proofClaims: Object.freeze([]),
  proofLimitations: Object.freeze([]),
  recommendedActions: Object.freeze([]),
  requiredControls: Object.freeze([]),
}) as unknown as ProductionDecisionProfileSummary
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
  // With a now that cannot be compared, no expiry was checked at all
  const bundleFreshnessFailed = hasAny(codes, [
    'bundle.expired',
    'bundle.expires_at_invalid',
    'bundle.expiry_required',
    'bundle.issued_at_future',
    'bundle.issued_at_invalid',
    'verification.now_invalid',
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
  // The dates a bundle carries are a claim until its signature bears them out
  const bundleDatesUnproven = !result.bundle.signatureValid
  const bundleFreshnessStatus: ProductionControlStatus = bundleFreshnessFailed || bundleDatesUnproven
    ? 'fail'
    : (bundleHasExpiry ? 'pass' : 'not-checked')
  const companionEvidenceRequired = result.deployment.companionEvidence.requirements.some(requirement => requirement.required !== false)
  const companionEvidenceChecked = result.deployment.companionEvidence.evidence.length > 0
  // With a now that cannot be compared, no evidence age and no manifest expiry
  // was compared. A control that depends on one of them cannot read pass. One
  // that compares nothing against the time is left as it was: evidence has an
  // age to compare only where its requirement sets a window and the evidence
  // was supplied.
  const nowInvalid = codes.has('verification.now_invalid')
  const suppliedEvidenceIds = new Set(result.deployment.companionEvidence.evidence.map(evidence => evidence.id))
  // Any window other than zero counts, well formed or not: a well-formed one
  // could not be compared against the time, and a malformed one was not
  // applied, so either way the evidence was not aged. The window is not
  // converted to tell them apart, as converting an object that JSON can
  // carry, such as {"toString":1}, throws.
  const evidenceAgeUnchecked = nowInvalid
    && result.deployment.companionEvidence.requirements.some(requirement => {
      const window: unknown = requirement.maxAgeSeconds
      return window !== undefined && window !== 0 && suppliedEvidenceIds.has(requirement.id)
    })
  // Only a policy that was applied is read. The policy of a bundle that is not
  // authentic is handed back as it was given, and every control that reports
  // on it reads not-checked below. An applied one is still read through
  // record(), as a policy that arrives as JSON need not be an object.
  const policyApplied = isAuthenticBundle(result.bundle)
  const manifestExpiryUnchecked = nowInvalid && policyApplied
    && list(record(result.deployment.policy).circleManifests).length > 0
  const companionEvidenceFailed = hasPrefix(codes, 'companion.')
  const companionEvidenceStatus: ProductionControlStatus = companionEvidenceFailed || evidenceAgeUnchecked
    ? 'fail'
    : (companionEvidenceRequired || companionEvidenceChecked ? 'pass' : 'not-checked')
  // An assertion too malformed to read had nothing in it for these checks to
  // read, so none of them can be said to have passed
  const unreadable = result.deployment.profileVerification.events
    .some(item => !isFullyReadable(item.event))
  const circlePolicyFailed = hasPrefix(codes, 'circle.')
  // A malformed threshold or window, or a malformed or unused allowance, means
  // the threshold or the freshness window was not applied as the policy meant
  // it, so the control that reports them fails with it. So does a now that
  // cannot be compared, wherever an assertion was supplied, even one with no
  // date that would have been compared, such as with the window off and no
  // expiration tag. With no assertion there was nothing to compare, and the
  // control reads as at a usable time.
  const assertionDateUnchecked = nowInvalid && result.deployment.profileVerification.events.length > 0
  const proofOrFreshnessFailed = hasPrefix(codes, 'proof.')
    || hasPrefix(codes, 'federation.')
    || hasPrefix(codes, 'assertion.')
    || codes.has('policy.min_distinct_signers_invalid')
    || codes.has('policy.max_age_seconds_invalid')
    || codes.has('policy.max_future_seconds_invalid')
    || assertionDateUnchecked
  // A bound that is not a number was not applied, so its metric was not checked
  const metricPolicyFailed = hasPrefix(codes, 'metric.') || codes.has('policy.metric_policy_invalid')

  const controls = [
    control(
      'bundle-publisher',
      'Trusted bundle publisher',
      // The signer a bundle names is a claim until its signature bears it out
      result.bundle.publisherTrusted && result.bundle.signatureValid ? 'pass' : 'fail',
      result.bundle.publisherTrusted && result.bundle.signatureValid
        ? 'The signed deployment bundle came from a configured trusted publisher key.'
        : result.bundle.publisherTrusted
          ? 'The bundle names a configured trusted publisher key, but its signature does not verify, so it cannot be tied to that key.'
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
          : bundleFreshnessFailed
            ? 'The deployment bundle is missing required expiry metadata, expired, or outside its valid time window.'
            : 'The bundle\'s signature does not verify, so the dates it carries prove nothing about whether it is in date.',
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
      circlePolicyFailed || manifestExpiryUnchecked || unreadable ? 'fail' : 'pass',
      circlePolicyFailed
        ? 'The assertion used a circle that is missing, malformed, expired, revoked, superseded, unaccepted, or not allowed for this profile.'
        : manifestExpiryUnchecked
          ? 'The verification time cannot be compared, so no circle manifest was checked for expiry.'
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
      proofOrFreshnessFailed || unreadable ? 'fail' : 'pass',
      proofOrFreshnessFailed
        ? 'The proof, federation, threshold, or assertion freshness check failed.'
        : unreadable
          ? ASSERTION_UNREADABLE
          : 'The nostr-veil proof, signer threshold, federation policy, and assertion freshness checks passed.',
    ),
    control(
      'metric-policy',
      'Metric policy',
      metricPolicyFailed || unreadable ? 'fail' : 'pass',
      metricPolicyFailed
        ? 'At least one metric is missing, unexpected, non-numeric, non-integer, or outside the deployment bounds, or a bound in the policy is malformed.'
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
          : companionEvidenceFailed
            ? 'A required companion evidence check is missing, failed, stale, malformed, or for the wrong subject.'
            : 'The verification time cannot be compared, so no companion evidence was checked for age.',
    ),
  ]

  // The policy of a bundle that is not authentic was not applied, so nothing
  // it asks for was checked, and no control may say that it passed or failed
  if (!policyApplied) {
    return Object.freeze(controls.map(item => POLICY_CONTROLS.has(item.id)
      ? control(item.id, item.label, 'not-checked', POLICY_NOT_APPLIED)
      : item))
  }
  // With no assertion at all, a check made on each assertion ran on none. It
  // may still have failed for a fault in the policy itself, but it cannot have
  // passed.
  if (result.deployment.profileVerification.events.length === 0) {
    return Object.freeze(controls.map(item => EVENT_CONTROLS.has(item.id) && item.status === 'pass'
      ? control(item.id, item.label, 'not-checked', NO_ASSERTION)
      : item))
  }
  return Object.freeze(controls)
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
  const policyApplied = isAuthenticBundle(result.bundle)

  return Object.freeze({
    decision: result.decision,
    valid: result.valid,
    recommendedAction: recommendedAction(result.valid, issues),
    bundle: bundleSummary(result),
    // Only an applied policy is described. One that was not applied is not the
    // operator's, and what it says of itself is not repeated to them.
    profile: policyApplied ? profileSummary(record(result.deployment.policy).profile) : BLANK_PROFILE,
    policyId: policyApplied ? record(result.deployment.policy).id as string : '',
    subject: policyApplied ? record(result.deployment.policy).expectedSubject as string : '',
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
