import { NIP85_KINDS } from '../nip85/types.js'
import type { SubjectFormat, UseCaseProfile, UseCaseProfileDefinitionValidation } from './types.js'

const SLUG_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const TAG_NAME_RE = /^[A-Za-z0-9_.-]+$/
const DECIMAL_INTEGER_RE = /^(0|[1-9]\d*)$/

const PROFILE_STATUSES = new Set(['supported', 'profile-needed'])
const PROOF_VERSIONS = new Set(['v1', 'v2'])
const METRIC_DIRECTIONS = new Set(['higher-is-better', 'lower-is-better', 'count', 'application-defined'])

const SUBJECT_FORMATS = new Set<SubjectFormat>([
  'pubkey',
  'event',
  'address',
  'identifier',
  'relay',
  'nip05',
  'domain',
  'git',
  'lnurlp',
  'maintainer',
  'nip96',
  'package',
  'package-digest',
  'service',
  'vendor',
  'source',
])

const ROUTES = new Map<number, { subjectTag: 'p' | 'e' | 'a' | 'k'; subjectFormats: ReadonlySet<SubjectFormat> }>([
  [NIP85_KINDS.USER, { subjectTag: 'p', subjectFormats: new Set<SubjectFormat>(['pubkey']) }],
  [NIP85_KINDS.EVENT, { subjectTag: 'e', subjectFormats: new Set<SubjectFormat>(['event']) }],
  [NIP85_KINDS.ADDRESSABLE, { subjectTag: 'a', subjectFormats: new Set<SubjectFormat>(['address']) }],
  [
    NIP85_KINDS.IDENTIFIER,
    {
      subjectTag: 'k',
      subjectFormats: new Set<SubjectFormat>([
        'identifier',
        'relay',
        'nip05',
        'domain',
        'git',
        'lnurlp',
        'maintainer',
        'nip96',
        'package',
        'package-digest',
        'service',
        'vendor',
        'source',
      ]),
    },
  ],
])

const USER_NUMERIC_METRICS = new Set([
  'followers',
  'rank',
  'first_created_at',
  'post_cnt',
  'reply_cnt',
  'reactions_cnt',
  'zap_amt_recd',
  'zap_amt_sent',
  'zap_cnt_recd',
  'zap_cnt_sent',
  'zap_avg_amt_day_recd',
  'zap_avg_amt_day_sent',
  'reports_cnt_recd',
  'reports_cnt_sent',
  'active_hours_start',
  'active_hours_end',
])
const EVENT_NUMERIC_METRICS = new Set([
  'rank',
  'comment_cnt',
  'quote_cnt',
  'repost_cnt',
  'reaction_cnt',
  'zap_cnt',
  'zap_amount',
])
const IDENTIFIER_NUMERIC_METRICS = new Set(['rank', 'comment_cnt', 'reaction_cnt'])

const METRICS_BY_KIND = new Map<number, ReadonlySet<string>>([
  [NIP85_KINDS.USER, USER_NUMERIC_METRICS],
  [NIP85_KINDS.EVENT, EVENT_NUMERIC_METRICS],
  [NIP85_KINDS.ADDRESSABLE, EVENT_NUMERIC_METRICS],
  [NIP85_KINDS.IDENTIFIER, IDENTIFIER_NUMERIC_METRICS],
])

const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validateText(value: string, label: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be non-empty`)
  }
}

function validateTextArray(values: readonly string[] | undefined, label: string, errors: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    errors.push(`${label} must contain at least one entry`)
    return []
  }

  return values.map((value, index) => {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${label}[${index}] must be non-empty`)
      return ''
    }
    return value
  })
}

function validateControls(profile: UseCaseProfile, errors: string[]): string[] {
  if (!Array.isArray(profile.requiredControls) || profile.requiredControls.length === 0) {
    errors.push('profile.requiredControls must contain at least one control')
    return []
  }

  const text: string[] = []
  for (const [index, control] of profile.requiredControls.entries()) {
    if (typeof control.risk !== 'string' || control.risk.trim() === '') {
      errors.push(`profile.requiredControls[${index}].risk must be non-empty`)
    } else {
      text.push(control.risk)
    }
    if (typeof control.control !== 'string' || control.control.trim() === '') {
      errors.push(`profile.requiredControls[${index}].control must be non-empty`)
    } else {
      text.push(control.control)
    }
  }
  return text
}

function validateCoreFields(profile: UseCaseProfile, errors: string[], warnings: string[]): void {
  validateText(profile.id, 'profile.id', errors)
  if (typeof profile.id === 'string' && profile.id.trim() !== '' && !SLUG_RE.test(profile.id)) {
    errors.push('profile.id must be a lowercase slug')
  }
  validateText(profile.title, 'profile.title', errors)
  validateText(profile.group, 'profile.group', errors)

  if (!PROFILE_STATUSES.has(profile.status)) {
    errors.push('profile.status must be supported or profile-needed')
  }
  if (!PROOF_VERSIONS.has(profile.proofVersion)) {
    errors.push('profile.proofVersion must be v1 or v2')
  } else if (profile.proofVersion !== 'v2') {
    warnings.push('profile.proofVersion is v1; production profiles should prefer v2 kind and subject-hint binding')
  }

  if (!isPositiveInteger(profile.minDistinctSigners)) {
    errors.push('profile.minDistinctSigners must be a positive integer')
  } else if (profile.minDistinctSigners < 3) {
    warnings.push('profile.minDistinctSigners is below 3; production deployments should justify the weaker threshold')
  }

  if (!isNonNegativeInteger(profile.maxAgeSeconds)) {
    errors.push('profile.maxAgeSeconds must be a non-negative integer')
  } else if (profile.maxAgeSeconds === 0) {
    warnings.push('profile.maxAgeSeconds is 0; production deployments should set an explicit freshness window')
  }
}

function validateRoute(profile: UseCaseProfile, errors: string[]): void {
  if (!Number.isSafeInteger(profile.kind)) {
    errors.push('profile.kind must be a safe integer')
    return
  }

  const route = ROUTES.get(profile.kind)
  if (route === undefined) {
    errors.push('profile.kind must be a NIP-85 assertion kind supported by nostr-veil')
    return
  }

  if (profile.subjectTag !== route.subjectTag) {
    errors.push(`profile.kind ${profile.kind} must use subjectTag ${route.subjectTag}`)
  }

  if (!Array.isArray(profile.subjectFormats) || profile.subjectFormats.length === 0) {
    errors.push('profile.subjectFormats must contain at least one format')
  } else {
    const seen = new Set<string>()
    for (const [index, format] of profile.subjectFormats.entries()) {
      if (!SUBJECT_FORMATS.has(format)) {
        errors.push(`profile.subjectFormats[${index}] "${format}" is unknown`)
      } else if (!route.subjectFormats.has(format)) {
        errors.push(`profile.subjectFormats[${index}] "${format}" is not compatible with kind ${profile.kind}`)
      }
      if (seen.has(format)) {
        errors.push(`profile.subjectFormats[${index}] "${format}" is duplicated`)
      }
      seen.add(format)
    }
  }

  if (profile.kind === NIP85_KINDS.IDENTIFIER) {
    if (profile.subjectTagValue === undefined || !DECIMAL_INTEGER_RE.test(profile.subjectTagValue)) {
      errors.push('profile.kind 30385 must define a decimal subjectTagValue namespace')
    }
  } else if (profile.subjectTagValue !== undefined) {
    errors.push('profile.subjectTagValue is only supported for kind 30385 identifier profiles')
  }
}

function validateMetrics(profile: UseCaseProfile, errors: string[]): void {
  if (!Array.isArray(profile.metrics) || profile.metrics.length === 0) {
    errors.push('profile.metrics must contain at least one metric')
    return
  }

  const allowedMetrics = METRICS_BY_KIND.get(profile.kind)
  const seen = new Set<string>()
  for (const [index, metric] of profile.metrics.entries()) {
    const prefix = `profile.metrics[${index}]`
    validateText(metric.name, `${prefix}.name`, errors)
    validateText(metric.meaning, `${prefix}.meaning`, errors)
    if (!METRIC_DIRECTIONS.has(metric.direction)) {
      errors.push(`${prefix}.direction must be a known direction`)
    }
    if (typeof metric.name === 'string' && metric.name.trim() !== '') {
      if (!TAG_NAME_RE.test(metric.name)) {
        errors.push(`${prefix}.name must be a NIP-85 tag name`)
      }
      if (META_TAGS.has(metric.name) || metric.name.startsWith('veil-')) {
        errors.push(`${prefix}.name must not be a subject or nostr-veil metadata tag`)
      }
      if (allowedMetrics !== undefined && !allowedMetrics.has(metric.name)) {
        errors.push(`${prefix}.name "${metric.name}" is not valid for kind ${profile.kind}`)
      }
      if (seen.has(metric.name)) {
        errors.push(`${prefix}.name "${metric.name}" is duplicated`)
      }
      seen.add(metric.name)
    }
  }
}

function validateFederation(profile: UseCaseProfile, errors: string[]): void {
  if (profile.federation === undefined) return
  if (!isPositiveInteger(profile.federation.minCircles)) {
    errors.push('profile.federation.minCircles must be a positive integer')
  } else if (profile.federation.minCircles < 2) {
    errors.push('profile.federation.minCircles must be at least 2 for a federation profile')
  }
  if (typeof profile.federation.requireScope !== 'boolean') {
    errors.push('profile.federation.requireScope must be boolean')
  }
}

function containsAny(text: string, needles: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return needles.some(needle => lower.includes(needle))
}

function warnAboutOverclaims(proofClaims: readonly string[], warnings: string[]): void {
  const overclaimRe = /\b(proves?|guarantees?|ensures?|certifies?)\b.{0,100}\b(true|truth|safe|safety|legitimate|sybil|sybil-resistant|non-sybil|lawful|malware(?:-free)?|identity|unique|absence)\b/i
  proofClaims.forEach((claim, index) => {
    if (overclaimRe.test(claim)) {
      warnings.push(`profile.proofClaims[${index}] appears to claim a real-world conclusion; move that to required controls or limitations`)
    }
  })
}

function warnAboutDomainControls(profile: UseCaseProfile, controlText: string, warnings: string[]): void {
  const formats = new Set(profile.subjectFormats)
  if (
    ['package', 'git', 'maintainer'].some(format => formats.has(format as SubjectFormat))
    && !containsAny(controlText, [
      'signature',
      'provenance',
      'sbom',
      'reproducible',
      'vulnerability',
      'malware',
      'audit',
    ])
  ) {
    warnings.push('profile.requiredControls should name supply-chain controls for package, git, or maintainer subjects')
  }

  if (
    formats.has('relay')
    && !containsAny(controlText, ['uptime', 'latency', 'incident', 'probe', 'telemetry'])
  ) {
    warnings.push('profile.requiredControls should name live service controls for relay subjects')
  }

  if (
    ['nip05', 'domain', 'lnurlp', 'nip96'].some(format => formats.has(format as SubjectFormat))
    && !containsAny(controlText, ['dns', 'https', 'nip-05', 'lnurlp', 'nip-96', 'ownership'])
  ) {
    warnings.push('profile.requiredControls should name protocol and ownership checks for domain-backed subjects')
  }

  if (formats.has('vendor') && !containsAny(controlText, ['dispute', 'escrow', 'evidence', 'fraud', 'purchase'])) {
    warnings.push('profile.requiredControls should name marketplace controls for vendor subjects')
  }
}

export function validateUseCaseProfileDefinition(profile: UseCaseProfile): UseCaseProfileDefinitionValidation {
  const errors: string[] = []
  const warnings: string[] = []

  validateCoreFields(profile, errors, warnings)
  validateRoute(profile, errors)
  validateMetrics(profile, errors)
  validateFederation(profile, errors)
  validateTextArray(profile.failurePolicy, 'profile.failurePolicy', errors)

  const proofClaims = validateTextArray(profile.proofClaims, 'profile.proofClaims', errors)
  validateTextArray(profile.proofLimitations, 'profile.proofLimitations', errors)
  validateTextArray(profile.recommendedActions, 'profile.recommendedActions', errors)
  const controlText = validateControls(profile, errors).join(' ')

  warnAboutOverclaims(proofClaims, warnings)
  warnAboutDomainControls(profile, controlText, warnings)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
