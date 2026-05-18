import { verifySignedEvent } from '../signing.js'
import {
  canonicalAddressSubject,
  canonicalDomainSubject,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  canonicalPackageDigestSubject,
} from './canonical.js'
import type { EventTemplate } from '../nip85/types.js'
import type { SignedEvent } from '../signing.js'
import type { CompanionEvidence, CompanionEvidenceRequirement } from './policy.js'

const HEX64_RE = /^[0-9a-f]{64}$/

export const PACKAGE_RELEASE_COMPANION_EVIDENCE_IDS = [
  'npm-provenance',
  'sbom',
  'vulnerability-feed',
] as const

export const NIP05_DOMAIN_COMPANION_EVIDENCE_IDS = [
  'nip05-resolution',
  'https-probe',
  'dns-owner-check',
] as const

export const LIST_LABELER_COMPANION_EVIDENCE_IDS = [
  'list-revision-fetch',
  'sample-review',
  'correction-channel',
] as const

export type PackageReleaseCompanionEvidenceId = typeof PACKAGE_RELEASE_COMPANION_EVIDENCE_IDS[number]
export type Nip05DomainCompanionEvidenceId = typeof NIP05_DOMAIN_COMPANION_EVIDENCE_IDS[number]
export type ListLabelerCompanionEvidenceId = typeof LIST_LABELER_COMPANION_EVIDENCE_IDS[number]

export interface CompanionEvidenceRequirementOptions {
  maxAgeSeconds?: number
  required?: boolean
}

export interface NpmPackageVersionEvidence {
  dist?: {
    integrity?: string
    shasum?: string
    tarball?: string
  }
  name: string
  provenance?: boolean | {
    verified?: boolean
  }
  version: string
}

export interface PackageArtefactDigestEvidence {
  algorithm: 'sha256' | 'sha512' | string
  digest: string
}

export interface SbomEvidence {
  format?: string
  packageName?: string
  subject?: string
  version?: string
}

export interface VulnerabilityFeedEvidence {
  critical?: number
  high?: number
  ok?: boolean
  subject?: string
  vulnerabilities?: readonly unknown[]
}

export interface ResolvePackageReleaseCompanionEvidenceOptions {
  artefactDigest?: PackageArtefactDigestEvidence
  checkedAt?: number
  packageVersion: NpmPackageVersionEvidence
  sbom?: SbomEvidence
  subject: string
  vulnerabilityReport?: VulnerabilityFeedEvidence
}

export interface Nip05DocumentEvidence {
  names: Readonly<Record<string, string>>
}

export interface HttpsProbeEvidence {
  ok: boolean
  status?: number
  url?: string
}

export interface DnsOwnerCheckEvidence {
  domain: string
  matched: boolean
}

export interface ResolveNip05DomainCompanionEvidenceOptions {
  checkedAt?: number
  dnsOwnerCheck?: DnsOwnerCheckEvidence
  expectedPubkey?: string
  httpsProbe?: HttpsProbeEvidence
  nip05Document?: Nip05DocumentEvidence
  subject: string
}

export interface ListRevisionEvent extends EventTemplate {
  id?: string
  pubkey: string
  sig?: string
}

export interface SampleReviewEvidence {
  requiredItems?: number
  reviewedItems: number
}

export interface CorrectionChannelEvidence {
  reachable: boolean
  url: string
}

export interface ResolveListLabelerCompanionEvidenceOptions {
  checkedAt?: number
  correctionChannel?: CorrectionChannelEvidence
  listEvent?: ListRevisionEvent
  requireSignature?: boolean
  sampleReview?: SampleReviewEvidence
  subject: string
}

interface NpmSubjectParts {
  digest?: PackageArtefactDigestEvidence
  packageSubject: string
  name: string
  version: string
}

interface Nip05SubjectParts {
  domain: string
  name?: string
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function checkedAt(value: number | undefined): number {
  return value ?? nowSeconds()
}

function evidence(id: string, status: CompanionEvidence['status'], subject: string, checkedAtValue: number, summary: string): CompanionEvidence {
  return Object.freeze({
    checkedAt: checkedAtValue,
    id,
    status,
    subject,
    summary,
  })
}

function requirement(id: string, label: string, subject: string, options: CompanionEvidenceRequirementOptions = {}): CompanionEvidenceRequirement {
  return Object.freeze({
    id,
    label,
    expectedSubject: subject,
    maxAgeSeconds: options.maxAgeSeconds ?? 300,
    required: options.required ?? true,
  })
}

function parseNpmPackageSubject(subject: string): NpmSubjectParts {
  let packageSubject = subject
  let digest: PackageArtefactDigestEvidence | undefined

  if (subject.startsWith('package-digest:')) {
    const rest = subject.slice('package-digest:'.length)
    const digestSeparator = rest.lastIndexOf(':')
    const algorithmSeparator = rest.lastIndexOf(':', digestSeparator - 1)
    if (digestSeparator <= 0 || algorithmSeparator <= 0) {
      throw new Error('package digest subject must include package, algorithm, and digest')
    }
    packageSubject = rest.slice(0, algorithmSeparator)
    digest = {
      algorithm: rest.slice(algorithmSeparator + 1, digestSeparator),
      digest: rest.slice(digestSeparator + 1),
    }
  }

  if (!packageSubject.startsWith('npm:')) {
    throw new Error('package subject must be npm:package@version or package-digest:npm:package@version:algorithm:digest')
  }
  const spec = packageSubject.slice('npm:'.length)
  const versionSeparator = spec.lastIndexOf('@')
  if (versionSeparator <= 0 || versionSeparator === spec.length - 1) {
    throw new Error('package subject must include name and version')
  }
  const name = spec.slice(0, versionSeparator)
  const version = spec.slice(versionSeparator + 1)
  const canonicalPackageSubject = canonicalNpmPackageSubject(name, version)
  if (canonicalPackageSubject !== packageSubject) {
    throw new Error('package subject is not canonical')
  }
  if (digest !== undefined && canonicalPackageDigestSubject('npm', name, version, digest.algorithm, digest.digest) !== subject) {
    throw new Error('package digest subject is not canonical')
  }

  return {
    ...(digest === undefined ? {} : { digest }),
    packageSubject,
    name,
    version,
  }
}

function provenanceVerified(value: NpmPackageVersionEvidence['provenance']): boolean {
  return value === true || (typeof value === 'object' && value !== null && value.verified === true)
}

function packageVersionMatches(subject: NpmSubjectParts, version: NpmPackageVersionEvidence): boolean {
  try {
    return canonicalNpmPackageSubject(version.name, version.version) === subject.packageSubject
  } catch {
    return false
  }
}

function packageDigestMatches(subject: NpmSubjectParts, digest: PackageArtefactDigestEvidence | undefined): boolean {
  if (subject.digest === undefined) return true
  if (digest === undefined) return false
  try {
    return canonicalPackageDigestSubject('npm', subject.name, subject.version, digest.algorithm, digest.digest)
      === `package-digest:${subject.packageSubject}:${subject.digest.algorithm}:${subject.digest.digest}`
  } catch {
    return false
  }
}

function packageDigestSubject(subject: NpmSubjectParts): string | undefined {
  if (subject.digest === undefined) return undefined
  return `package-digest:${subject.packageSubject}:${subject.digest.algorithm}:${subject.digest.digest}`
}

function sbomMatches(subject: NpmSubjectParts, sbom: SbomEvidence | undefined): boolean {
  if (sbom === undefined) return false
  const digestSubject = packageDigestSubject(subject)
  if (sbom.subject !== undefined) {
    return digestSubject === undefined
      ? sbom.subject === subject.packageSubject
      : sbom.subject === digestSubject
  }
  if (digestSubject !== undefined) return false
  if (sbom.packageName === undefined || sbom.version === undefined) return false
  try {
    return canonicalNpmPackageSubject(sbom.packageName, sbom.version) === subject.packageSubject
  } catch {
    return false
  }
}

function vulnerabilityReportMatches(subject: NpmSubjectParts, report: VulnerabilityFeedEvidence | undefined): boolean {
  if (report === undefined) return false
  const digestSubject = packageDigestSubject(subject)
  if (report.subject === undefined) return false
  if (report.subject !== subject.packageSubject && report.subject !== digestSubject) {
    return false
  }
  if (report.ok === false) return false
  if ((report.critical ?? 0) > 0 || (report.high ?? 0) > 0) return false
  if ((report.vulnerabilities?.length ?? 0) > 0) return false
  return true
}

export function packageReleaseCompanionEvidenceRequirements(
  subject: string,
  options: CompanionEvidenceRequirementOptions = {},
): CompanionEvidenceRequirement[] {
  return [
    requirement('npm-provenance', 'npm provenance statement', subject, options),
    requirement('sbom', 'software bill of materials', subject, options),
    requirement('vulnerability-feed', 'vulnerability feed check', subject, options),
  ]
}

export function resolvePackageReleaseCompanionEvidence(
  options: ResolvePackageReleaseCompanionEvidenceOptions,
): CompanionEvidence[] {
  const at = checkedAt(options.checkedAt)
  let subject: NpmSubjectParts
  try {
    subject = parseNpmPackageSubject(options.subject)
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'package subject is invalid'
    return PACKAGE_RELEASE_COMPANION_EVIDENCE_IDS.map(id => evidence(id, 'fail', options.subject, at, summary))
  }

  const versionMatches = packageVersionMatches(subject, options.packageVersion)
  const digestMatches = packageDigestMatches(subject, options.artefactDigest)
  const provenancePasses = versionMatches
    && digestMatches
    && provenanceVerified(options.packageVersion.provenance)
    && (options.packageVersion.dist?.integrity !== undefined || options.packageVersion.dist?.shasum !== undefined)
  const sbomPasses = versionMatches && sbomMatches(subject, options.sbom)
  const vulnerabilityPasses = versionMatches && vulnerabilityReportMatches(subject, options.vulnerabilityReport)

  return [
    evidence(
      'npm-provenance',
      provenancePasses ? 'pass' : 'fail',
      options.subject,
      at,
      provenancePasses
        ? 'npm package metadata, artefact digest, and provenance statement match the reviewed subject'
        : 'npm provenance evidence is missing, failed, or for a different subject',
    ),
    evidence(
      'sbom',
      sbomPasses ? 'pass' : 'fail',
      options.subject,
      at,
      sbomPasses
        ? 'SBOM metadata matches the reviewed package subject'
        : 'SBOM evidence is missing or for a different subject',
    ),
    evidence(
      'vulnerability-feed',
      vulnerabilityPasses ? 'pass' : 'fail',
      options.subject,
      at,
      vulnerabilityPasses
        ? 'vulnerability feed reports no high or critical findings for the reviewed subject'
        : 'vulnerability feed evidence is missing, unsafe, or for a different subject',
    ),
  ]
}

function parseNip05Subject(subject: string): Nip05SubjectParts {
  if (subject.startsWith('nip05:')) {
    const canonical = canonicalNip05Subject(subject)
    const [name, domain] = canonical.slice('nip05:'.length).split('@')
    return { name, domain }
  }
  if (subject.startsWith('domain:')) {
    return { domain: canonicalDomainSubject(subject).slice('domain:'.length) }
  }
  throw new Error('subject must be nip05:name@domain or domain:host')
}

function hostnameFromUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return undefined
  }
}

export function nip05DomainCompanionEvidenceRequirements(
  subject: string,
  options: CompanionEvidenceRequirementOptions = {},
): CompanionEvidenceRequirement[] {
  return [
    requirement('nip05-resolution', 'NIP-05 resolution', subject, options),
    requirement('https-probe', 'HTTPS service probe', subject, options),
    requirement('dns-owner-check', 'DNS owner check', subject, options),
  ]
}

export function resolveNip05DomainCompanionEvidence(
  options: ResolveNip05DomainCompanionEvidenceOptions,
): CompanionEvidence[] {
  const at = checkedAt(options.checkedAt)
  let subject: Nip05SubjectParts
  try {
    subject = parseNip05Subject(options.subject)
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'NIP-05/domain subject is invalid'
    return NIP05_DOMAIN_COMPANION_EVIDENCE_IDS.map(id => evidence(id, 'fail', options.subject, at, summary))
  }

  const resolvedPubkey = subject.name === undefined ? undefined : options.nip05Document?.names[subject.name]
  const nip05Passes = subject.name !== undefined
    && resolvedPubkey !== undefined
    && HEX64_RE.test(resolvedPubkey)
    && (options.expectedPubkey === undefined || options.expectedPubkey === resolvedPubkey)
  const probeHost = hostnameFromUrl(options.httpsProbe?.url)
  const probeUrlProvided = options.httpsProbe?.url !== undefined
  const httpsPasses = options.httpsProbe?.ok === true
    && (options.httpsProbe.status === undefined || (options.httpsProbe.status >= 200 && options.httpsProbe.status < 400))
    && (!probeUrlProvided || probeHost === subject.domain)
  let dnsDomain: string | undefined
  try {
    dnsDomain = options.dnsOwnerCheck === undefined
      ? undefined
      : canonicalDomainSubject(options.dnsOwnerCheck.domain).slice('domain:'.length)
  } catch {
    dnsDomain = undefined
  }
  const dnsPasses = options.dnsOwnerCheck?.matched === true && dnsDomain === subject.domain

  return [
    evidence(
      'nip05-resolution',
      nip05Passes ? 'pass' : 'fail',
      options.subject,
      at,
      nip05Passes
        ? 'NIP-05 document resolves the reviewed name to the expected pubkey'
        : 'NIP-05 resolution is missing, failed, or for a different subject',
    ),
    evidence(
      'https-probe',
      httpsPasses ? 'pass' : 'fail',
      options.subject,
      at,
      httpsPasses
        ? 'HTTPS probe succeeded for the reviewed provider subject'
        : 'HTTPS probe is missing, failed, or for a different subject',
    ),
    evidence(
      'dns-owner-check',
      dnsPasses ? 'pass' : 'fail',
      options.subject,
      at,
      dnsPasses
        ? 'DNS owner check matches the reviewed provider subject'
        : 'DNS owner evidence is missing, failed, or for a different subject',
    ),
  ]
}

function isSignedEvent(event: ListRevisionEvent): event is SignedEvent {
  return typeof event.id === 'string'
    && typeof event.pubkey === 'string'
    && typeof event.sig === 'string'
    && typeof event.created_at === 'number'
}

function tagValue(event: EventTemplate, name: string): string | undefined {
  return event.tags.find(tag => tag[0] === name)?.[1]
}

function eventAddress(event: ListRevisionEvent): string | undefined {
  const d = tagValue(event, 'd')
  if (d === undefined) return undefined
  try {
    return canonicalAddressSubject(event.kind, event.pubkey, d)
  } catch {
    return undefined
  }
}

function validHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function listLabelerCompanionEvidenceRequirements(
  subject: string,
  options: CompanionEvidenceRequirementOptions = {},
): CompanionEvidenceRequirement[] {
  return [
    requirement('list-revision-fetch', 'reviewed list revision fetched', subject, options),
    requirement('sample-review', 'sampled list entries reviewed', subject, options),
    requirement('correction-channel', 'correction channel reachable', subject, options),
  ]
}

export function resolveListLabelerCompanionEvidence(
  options: ResolveListLabelerCompanionEvidenceOptions,
): CompanionEvidence[] {
  const at = checkedAt(options.checkedAt)
  const requireSignature = options.requireSignature ?? true
  let listRevisionPasses = false
  let addressMatches = false
  if (options.listEvent !== undefined) {
    addressMatches = eventAddress(options.listEvent) === options.subject
    const signaturePasses = !requireSignature || (isSignedEvent(options.listEvent) && verifySignedEvent(options.listEvent))
    listRevisionPasses = addressMatches && signaturePasses
  }
  const samplePasses = options.sampleReview !== undefined
    && Number.isSafeInteger(options.sampleReview.reviewedItems)
    && options.sampleReview.reviewedItems >= (options.sampleReview.requiredItems ?? 1)
  const correctionPasses = options.correctionChannel !== undefined
    && options.correctionChannel.reachable
    && validHttpUrl(options.correctionChannel.url)

  return [
    evidence(
      'list-revision-fetch',
      listRevisionPasses ? 'pass' : 'fail',
      options.subject,
      at,
      listRevisionPasses
        ? 'fetched list revision matches the reviewed addressable subject and signature policy'
        : addressMatches
          ? 'fetched list revision matches the subject but failed signature policy'
          : 'list revision is missing or for a different subject',
    ),
    evidence(
      'sample-review',
      samplePasses ? 'pass' : 'fail',
      options.subject,
      at,
      samplePasses
        ? 'list sampling policy reviewed enough entries'
        : 'sample review is missing or below the required item count',
    ),
    evidence(
      'correction-channel',
      correctionPasses ? 'pass' : 'fail',
      options.subject,
      at,
      correctionPasses
        ? 'correction channel is reachable for disputes or superseding assertions'
        : 'correction channel is missing, unreachable, or malformed',
    ),
  ]
}
