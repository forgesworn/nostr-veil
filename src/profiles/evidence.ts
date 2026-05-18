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

export interface EvidenceFetchInit {
  body?: string
  headers?: Readonly<Record<string, string>>
  method?: string
  signal?: unknown
}

export interface EvidenceFetchResponse {
  ok: boolean
  status: number
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
  text(): Promise<string>
}

export type EvidenceFetch = (input: string | URL, init?: EvidenceFetchInit) => Promise<EvidenceFetchResponse>

export interface NpmPackageVersionEvidence {
  dist?: {
    attestations?: {
      provenance?: {
        predicateType?: string
      }
      url?: string
    }
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

export interface FetchNpmPackageVersionEvidenceOptions {
  fetch?: EvidenceFetch
  registryUrl?: string
}

export interface FetchJsonSbomEvidenceOptions {
  fetch?: EvidenceFetch
  subject?: string
}

export interface FetchOsvVulnerabilityReportOptions {
  fetch?: EvidenceFetch
  url?: string
}

export interface VerifyPackageProvenanceContext {
  packageVersion: NpmPackageVersionEvidence
  subject: string
}

export interface CollectPackageReleaseCompanionEvidenceOptions {
  artefactDigest?: PackageArtefactDigestEvidence
  checkedAt?: number
  fetch?: EvidenceFetch
  fetchArtefactDigest?: boolean
  osv?: boolean | FetchOsvVulnerabilityReportOptions
  registryUrl?: string
  sbom?: SbomEvidence
  sbomUrl?: string
  subject: string
  verifyProvenance?: (
    packageVersion: NpmPackageVersionEvidence,
    context: VerifyPackageProvenanceContext,
  ) => boolean | NpmPackageVersionEvidence['provenance'] | Promise<boolean | NpmPackageVersionEvidence['provenance']>
  vulnerabilityReport?: VulnerabilityFeedEvidence
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

export interface FetchNip05DocumentEvidenceOptions {
  fetch?: EvidenceFetch
}

export interface ProbeHttpsServiceOptions {
  fetch?: EvidenceFetch
  method?: string
}

export interface CollectNip05DomainCompanionEvidenceOptions {
  checkedAt?: number
  checkDnsOwner?: (domain: string) => boolean | DnsOwnerCheckEvidence | Promise<boolean | DnsOwnerCheckEvidence>
  dnsOwnerCheck?: DnsOwnerCheckEvidence
  expectedPubkey?: string
  fetch?: EvidenceFetch
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

export type NostrRelayWebSocketListener = (event: { data?: unknown }) => void

export interface NostrRelayWebSocket {
  addEventListener(type: string, listener: NostrRelayWebSocketListener): void
  close(code?: number, reason?: string): void
  send(data: string): void
}

export interface NostrRelayWebSocketConstructor {
  new(url: string): NostrRelayWebSocket
}

export interface FetchAddressableEventFromRelayOptions {
  relayUrl: string
  subject: string
  timeoutMs?: number
  WebSocket?: NostrRelayWebSocketConstructor
}

export interface ProbeCorrectionChannelOptions {
  fetch?: EvidenceFetch
}

export interface CollectListLabelerCompanionEvidenceOptions {
  checkedAt?: number
  correctionChannel?: CorrectionChannelEvidence | string
  fetch?: EvidenceFetch
  listEvent?: ListRevisionEvent
  relayUrl?: string
  requireSignature?: boolean
  sampleReview?: SampleReviewEvidence
  subject: string
  timeoutMs?: number
  WebSocket?: NostrRelayWebSocketConstructor
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

interface AddressSubjectParts {
  dTag: string
  kind: number
  pubkey: string
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

function failedEvidence(ids: readonly string[], subject: string, checkedAtValue: number, summary: string): CompanionEvidence[] {
  return ids.map(id => evidence(id, 'fail', subject, checkedAtValue, summary))
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

function defaultFetch(): EvidenceFetch {
  const candidate = (globalThis as { fetch?: EvidenceFetch }).fetch
  if (typeof candidate !== 'function') {
    throw new Error('fetch is not available; pass an EvidenceFetch implementation')
  }
  return candidate.bind(globalThis)
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function provenanceValue(value: unknown): NpmPackageVersionEvidence['provenance'] | undefined {
  if (typeof value === 'boolean') return value
  const provenance = record(value)
  if (provenance === undefined) return undefined
  const verified = provenance.verified
  return typeof verified === 'boolean' ? { verified } : undefined
}

function npmAttestationProvenanceValue(value: unknown): NpmPackageVersionEvidence['provenance'] | undefined {
  const attestations = record(value)
  const provenance = record(attestations?.provenance)
  const predicateType = stringValue(provenance?.predicateType)
  const url = stringValue(attestations?.url)
  if (predicateType === undefined || url === undefined) return undefined
  return {
    verified: predicateType.startsWith('https://slsa.dev/provenance/'),
  }
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

function packageVersionEvidenceFromJson(value: unknown, expectedName: string, expectedVersion: string): NpmPackageVersionEvidence {
  const metadata = record(value)
  if (metadata === undefined) throw new Error('npm registry response must be an object')
  const versions = record(metadata.versions)
  const candidate = versions === undefined ? metadata : record(versions[expectedVersion])
  if (candidate === undefined) {
    throw new Error(`npm registry response does not include ${expectedName}@${expectedVersion}`)
  }

  const name = stringValue(candidate.name)
  const version = stringValue(candidate.version)
  if (name === undefined || version === undefined) {
    throw new Error('npm package version metadata must include name and version')
  }

  const dist = record(candidate.dist)
  const attestations = record(dist?.attestations)
  const attestationProvenance = record(attestations?.provenance)
  const attestationPredicateType = stringValue(attestationProvenance?.predicateType)
  const attestationUrl = stringValue(attestations?.url)
  const provenance = provenanceValue(candidate.provenance) ?? npmAttestationProvenanceValue(attestations)
  return {
    ...(dist === undefined
      ? {}
      : {
          dist: {
            ...(attestations === undefined
              ? {}
              : {
                  attestations: {
                    ...(attestationProvenance === undefined
                      ? {}
                      : {
                          provenance: {
                            ...(attestationPredicateType === undefined ? {} : { predicateType: attestationPredicateType }),
                          },
                        }),
                    ...(attestationUrl === undefined ? {} : { url: attestationUrl }),
                  },
                }),
            ...(stringValue(dist.integrity) === undefined ? {} : { integrity: stringValue(dist.integrity) }),
            ...(stringValue(dist.shasum) === undefined ? {} : { shasum: stringValue(dist.shasum) }),
            ...(stringValue(dist.tarball) === undefined ? {} : { tarball: stringValue(dist.tarball) }),
          },
        }),
    name,
    ...(provenance === undefined ? {} : { provenance }),
    version,
  }
}

function npmRegistryPackageUrl(registryUrl: string, name: string): string {
  const base = registryUrl.replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(name)}`
}

export async function fetchNpmPackageVersionEvidence(
  name: string,
  version: string,
  options: FetchNpmPackageVersionEvidenceOptions = {},
): Promise<NpmPackageVersionEvidence> {
  const packageSubject = canonicalNpmPackageSubject(name, version)
  const subject = parseNpmPackageSubject(packageSubject)
  const fetch = options.fetch ?? defaultFetch()
  const response = await fetch(npmRegistryPackageUrl(options.registryUrl ?? 'https://registry.npmjs.org', subject.name), {
    method: 'GET',
  })
  if (!response.ok) {
    throw new Error(`npm registry returned HTTP ${response.status} for ${subject.name}`)
  }
  return packageVersionEvidenceFromJson(await response.json(), subject.name, subject.version)
}

function normaliseSbomFromSpdx(value: Record<string, unknown>, subject?: string): SbomEvidence | undefined {
  const packages = Array.isArray(value.packages) ? value.packages : []
  const firstPackage = record(packages.find(item => record(item) !== undefined))
  const packageName = stringValue(firstPackage?.name) ?? stringValue(value.name)
  const declaredSubject = subject ?? stringValue(value.subject)
  const version = stringValue(firstPackage?.versionInfo) ?? stringValue(value.versionInfo)

  if (packageName === undefined && version === undefined && declaredSubject === undefined) return undefined
  return {
    format: 'spdx',
    ...(packageName === undefined ? {} : { packageName }),
    ...(declaredSubject === undefined ? {} : { subject: declaredSubject }),
    ...(version === undefined ? {} : { version }),
  }
}

function normaliseSbomFromCycloneDx(value: Record<string, unknown>, subject?: string): SbomEvidence | undefined {
  const metadata = record(value.metadata)
  const component = record(metadata?.component)
  const packageName = stringValue(component?.name)
  const declaredSubject = subject ?? stringValue(value.subject)
  const version = stringValue(component?.version)

  if (packageName === undefined && version === undefined && declaredSubject === undefined) return undefined
  return {
    format: 'cyclonedx',
    ...(packageName === undefined ? {} : { packageName }),
    ...(declaredSubject === undefined ? {} : { subject: declaredSubject }),
    ...(version === undefined ? {} : { version }),
  }
}

export function normaliseSbomEvidence(value: unknown, subject?: string): SbomEvidence {
  const sbom = record(value)
  if (sbom === undefined) throw new Error('SBOM must be a JSON object')

  const bomFormat = stringValue(sbom.bomFormat)?.toLowerCase()
  const spdxVersion = stringValue(sbom.spdxVersion)
  const evidence = bomFormat === 'cyclonedx'
    ? normaliseSbomFromCycloneDx(sbom, subject)
    : spdxVersion !== undefined || Array.isArray(sbom.packages)
      ? normaliseSbomFromSpdx(sbom, subject)
      : undefined

  if (evidence === undefined) {
    throw new Error('SBOM format is not recognised as SPDX or CycloneDX')
  }
  return evidence
}

export async function fetchJsonSbomEvidence(
  url: string,
  options: FetchJsonSbomEvidenceOptions = {},
): Promise<SbomEvidence> {
  const fetch = options.fetch ?? defaultFetch()
  const response = await fetch(url, { method: 'GET' })
  if (!response.ok) throw new Error(`SBOM fetch returned HTTP ${response.status}`)
  return normaliseSbomEvidence(await response.json(), options.subject)
}

function osvSeverity(value: unknown): 'critical' | 'high' | undefined {
  const text = typeof value === 'string' ? value.toLowerCase() : ''
  if (text.includes('critical')) return 'critical'
  if (text.includes('high')) return 'high'
  return undefined
}

function osvVulnerabilitySeverity(value: unknown): 'critical' | 'high' | undefined {
  const vuln = record(value)
  if (vuln === undefined) return undefined
  const databaseSpecific = record(vuln.database_specific)
  const direct = osvSeverity(databaseSpecific?.severity)
  if (direct !== undefined) return direct
  const severity = Array.isArray(vuln.severity) ? vuln.severity : []
  for (const item of severity) {
    const severityItem = record(item)
    const parsed = osvSeverity(severityItem?.score) ?? osvSeverity(severityItem?.type)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

export async function fetchOsvVulnerabilityReport(
  subject: string,
  options: FetchOsvVulnerabilityReportOptions = {},
): Promise<VulnerabilityFeedEvidence> {
  const npmSubject = parseNpmPackageSubject(subject)
  const fetch = options.fetch ?? defaultFetch()
  const response = await fetch(options.url ?? 'https://api.osv.dev/v1/query', {
    body: JSON.stringify({
      package: {
        ecosystem: 'npm',
        name: npmSubject.name,
      },
      version: npmSubject.version,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}`)

  const body = record(await response.json())
  const vulnerabilities = Array.isArray(body?.vulns) ? body.vulns : []
  const high = vulnerabilities.filter(item => osvVulnerabilitySeverity(item) === 'high').length
  const critical = vulnerabilities.filter(item => osvVulnerabilitySeverity(item) === 'critical').length
  return {
    critical,
    high,
    ok: vulnerabilities.length === 0,
    subject,
    vulnerabilities,
  }
}

function digestAlgorithmName(algorithm: string): string {
  switch (algorithm.toLowerCase()) {
    case 'sha256':
      return 'SHA-256'
    case 'sha512':
      return 'SHA-512'
    default:
      throw new Error('package artefact digest supports sha256 and sha512')
  }
}

function bytesToLowerHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function digestHex(algorithm: string, buffer: ArrayBuffer): Promise<string> {
  const cryptoApi = (globalThis as { crypto?: { subtle?: { digest(name: string, data: ArrayBuffer): Promise<ArrayBuffer> } } }).crypto
  if (cryptoApi?.subtle === undefined) {
    throw new Error('WebCrypto subtle.digest is not available')
  }
  const digest = await cryptoApi.subtle.digest(digestAlgorithmName(algorithm), buffer)
  return bytesToLowerHex(new Uint8Array(digest))
}

async function fetchPackageArtefactDigest(
  tarballUrl: string | undefined,
  algorithm: string,
  fetch: EvidenceFetch,
): Promise<PackageArtefactDigestEvidence | undefined> {
  if (tarballUrl === undefined) return undefined
  const response = await fetch(tarballUrl, { method: 'GET' })
  if (!response.ok) throw new Error(`package artefact fetch returned HTTP ${response.status}`)
  return {
    algorithm,
    digest: await digestHex(algorithm, await response.arrayBuffer()),
  }
}

export async function collectPackageReleaseCompanionEvidence(
  options: CollectPackageReleaseCompanionEvidenceOptions,
): Promise<CompanionEvidence[]> {
  const at = checkedAt(options.checkedAt)
  let subject: NpmSubjectParts
  try {
    subject = parseNpmPackageSubject(options.subject)
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'package subject is invalid'
    return failedEvidence(PACKAGE_RELEASE_COMPANION_EVIDENCE_IDS, options.subject, at, summary)
  }

  const fetch = options.fetch ?? defaultFetch()
  let packageVersion: NpmPackageVersionEvidence
  try {
    packageVersion = await fetchNpmPackageVersionEvidence(subject.name, subject.version, {
      fetch,
      registryUrl: options.registryUrl,
    })
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'npm registry metadata fetch failed'
    return failedEvidence(PACKAGE_RELEASE_COMPANION_EVIDENCE_IDS, options.subject, at, summary)
  }

  if (options.verifyProvenance !== undefined) {
    const provenance = await options.verifyProvenance(packageVersion, {
      packageVersion,
      subject: options.subject,
    })
    packageVersion = {
      ...packageVersion,
      provenance,
    }
  }

  let sbom = options.sbom
  if (sbom === undefined && options.sbomUrl !== undefined) {
    try {
      sbom = await fetchJsonSbomEvidence(options.sbomUrl, {
        fetch,
      })
    } catch {
      sbom = undefined
    }
  }

  let vulnerabilityReport = options.vulnerabilityReport
  if (vulnerabilityReport === undefined && options.osv !== undefined && options.osv !== false) {
    try {
      vulnerabilityReport = await fetchOsvVulnerabilityReport(options.subject, {
        ...(typeof options.osv === 'object' ? options.osv : {}),
        fetch,
      })
    } catch {
      vulnerabilityReport = undefined
    }
  }

  let artefactDigest = options.artefactDigest
  if (artefactDigest === undefined && options.fetchArtefactDigest === true && subject.digest !== undefined) {
    try {
      artefactDigest = await fetchPackageArtefactDigest(packageVersion.dist?.tarball, subject.digest.algorithm, fetch)
    } catch {
      artefactDigest = undefined
    }
  }

  return resolvePackageReleaseCompanionEvidence({
    artefactDigest,
    checkedAt: at,
    packageVersion,
    sbom,
    subject: options.subject,
    vulnerabilityReport,
  })
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

function nip05DocumentUrl(subject: Nip05SubjectParts): string {
  if (subject.name === undefined) throw new Error('NIP-05 document fetch requires a nip05:name@domain subject')
  const url = new URL(`https://${subject.domain}/.well-known/nostr.json`)
  url.searchParams.set('name', subject.name)
  return url.toString()
}

function httpsProbeUrl(subject: Nip05SubjectParts): string {
  return subject.name === undefined ? `https://${subject.domain}/` : nip05DocumentUrl(subject)
}

function nip05DocumentFromJson(value: unknown): Nip05DocumentEvidence {
  const document = record(value)
  const names = record(document?.names)
  if (names === undefined) throw new Error('NIP-05 document must include a names object')
  const resolved: Record<string, string> = {}
  for (const [name, pubkey] of Object.entries(names)) {
    if (typeof pubkey === 'string') resolved[name] = pubkey
  }
  return { names: resolved }
}

export async function fetchNip05DocumentEvidence(
  subject: string,
  options: FetchNip05DocumentEvidenceOptions = {},
): Promise<Nip05DocumentEvidence> {
  const parsed = parseNip05Subject(subject)
  const fetch = options.fetch ?? defaultFetch()
  const response = await fetch(nip05DocumentUrl(parsed), { method: 'GET' })
  if (!response.ok) throw new Error(`NIP-05 document returned HTTP ${response.status}`)
  return nip05DocumentFromJson(await response.json())
}

export async function probeHttpsService(
  subject: string,
  options: ProbeHttpsServiceOptions = {},
): Promise<HttpsProbeEvidence> {
  let url: string
  try {
    url = httpsProbeUrl(parseNip05Subject(subject))
  } catch {
    url = subject
  }
  try {
    const fetch = options.fetch ?? defaultFetch()
    const response = await fetch(url, { method: options.method ?? 'GET' })
    return {
      ok: response.ok,
      status: response.status,
      url,
    }
  } catch {
    return { ok: false, url }
  }
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

export async function collectNip05DomainCompanionEvidence(
  options: CollectNip05DomainCompanionEvidenceOptions,
): Promise<CompanionEvidence[]> {
  const at = checkedAt(options.checkedAt)
  let subject: Nip05SubjectParts
  try {
    subject = parseNip05Subject(options.subject)
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'NIP-05/domain subject is invalid'
    return failedEvidence(NIP05_DOMAIN_COMPANION_EVIDENCE_IDS, options.subject, at, summary)
  }

  const documentPromise = options.nip05Document !== undefined || subject.name === undefined
    ? Promise.resolve(options.nip05Document)
    : fetchNip05DocumentEvidence(options.subject, { fetch: options.fetch }).catch(() => undefined)
  const probePromise = options.httpsProbe !== undefined
    ? Promise.resolve(options.httpsProbe)
    : probeHttpsService(options.subject, { fetch: options.fetch })
  const dnsPromise = options.dnsOwnerCheck !== undefined
    ? Promise.resolve(options.dnsOwnerCheck)
    : options.checkDnsOwner === undefined
      ? Promise.resolve(undefined)
      : Promise.resolve(options.checkDnsOwner(subject.domain)).then(result => {
          if (typeof result === 'boolean') return { domain: subject.domain, matched: result }
          return result
        }).catch(() => undefined)

  const [nip05Document, httpsProbe, dnsOwnerCheck] = await Promise.all([
    documentPromise,
    probePromise,
    dnsPromise,
  ])

  return resolveNip05DomainCompanionEvidence({
    checkedAt: at,
    dnsOwnerCheck,
    expectedPubkey: options.expectedPubkey,
    httpsProbe,
    nip05Document,
    subject: options.subject,
  })
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

function parseAddressSubject(subject: string): AddressSubjectParts {
  const [kindText, pubkey, ...dParts] = subject.split(':')
  const dTag = dParts.join(':')
  const kind = Number(kindText)
  if (!Number.isSafeInteger(kind) || kind < 0 || pubkey === undefined || dTag === '') {
    throw new Error('address subject must be kind:pubkey:d-tag')
  }
  const canonical = canonicalAddressSubject(kind, pubkey, dTag)
  if (canonical !== subject) throw new Error('address subject is not canonical')
  return { dTag, kind, pubkey }
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

function defaultWebSocket(): NostrRelayWebSocketConstructor {
  const candidate = (globalThis as { WebSocket?: NostrRelayWebSocketConstructor }).WebSocket
  if (typeof candidate !== 'function') {
    throw new Error('WebSocket is not available; pass a NostrRelayWebSocketConstructor')
  }
  return candidate
}

function relaySubscriptionId(): string {
  return `nostr-veil-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function relayMessage(raw: unknown): unknown[] | undefined {
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function signedEventFromRelay(value: unknown): SignedEvent | undefined {
  const event = record(value)
  if (event === undefined) return undefined
  if (
    typeof event.id !== 'string'
    || typeof event.pubkey !== 'string'
    || typeof event.sig !== 'string'
    || typeof event.content !== 'string'
    || typeof event.created_at !== 'number'
    || typeof event.kind !== 'number'
    || !Array.isArray(event.tags)
  ) {
    return undefined
  }
  const tags: string[][] = []
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || !tag.every(item => typeof item === 'string')) return undefined
    tags.push([...tag])
  }
  return {
    content: event.content,
    created_at: event.created_at,
    id: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    sig: event.sig,
    tags,
  }
}

export async function fetchAddressableEventFromRelay(
  options: FetchAddressableEventFromRelayOptions,
): Promise<SignedEvent | undefined> {
  const subject = parseAddressSubject(options.subject)
  const WebSocketImpl = options.WebSocket ?? defaultWebSocket()
  const timeoutMs = options.timeoutMs ?? 10_000
  const subscriptionId = relaySubscriptionId()

  return new Promise((resolve, reject) => {
    let settled = false
    let latest: SignedEvent | undefined
    const ws = new WebSocketImpl(options.relayUrl)
    const finish = (value: SignedEvent | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try {
        ws.send(JSON.stringify(['CLOSE', subscriptionId]))
      } catch {
        // Closing is best-effort after the evidence result is known.
      }
      ws.close()
      resolve(value)
    }
    const timeout = setTimeout(() => finish(latest), timeoutMs)

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify([
        'REQ',
        subscriptionId,
        {
          '#d': [subject.dTag],
          authors: [subject.pubkey],
          kinds: [subject.kind],
          limit: 5,
        },
      ]))
    })

    ws.addEventListener('message', (message) => {
      const data = relayMessage(message.data)
      if (data === undefined || data[1] !== subscriptionId) return

      if (data[0] === 'EVENT') {
        const event = signedEventFromRelay(data[2])
        if (event === undefined || eventAddress(event) !== options.subject) return
        if (latest === undefined || event.created_at > latest.created_at) latest = event
        return
      }

      if (data[0] === 'EOSE' || data[0] === 'CLOSED') {
        finish(latest)
      }
    })

    ws.addEventListener('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ws.close()
      reject(new Error(`WebSocket error while fetching ${options.subject} from ${options.relayUrl}`))
    })

    ws.addEventListener('close', () => finish(latest))
  })
}

export async function probeCorrectionChannel(
  url: string,
  options: ProbeCorrectionChannelOptions = {},
): Promise<CorrectionChannelEvidence> {
  try {
    const fetch = options.fetch ?? defaultFetch()
    const response = await fetch(url, { method: 'GET' })
    return {
      reachable: response.ok,
      url,
    }
  } catch {
    return {
      reachable: false,
      url,
    }
  }
}

export async function collectListLabelerCompanionEvidence(
  options: CollectListLabelerCompanionEvidenceOptions,
): Promise<CompanionEvidence[]> {
  const at = checkedAt(options.checkedAt)
  try {
    parseAddressSubject(options.subject)
  } catch (error) {
    const summary = error instanceof Error ? error.message : 'list subject is invalid'
    return failedEvidence(LIST_LABELER_COMPANION_EVIDENCE_IDS, options.subject, at, summary)
  }

  const listEventPromise = options.listEvent !== undefined || options.relayUrl === undefined
    ? Promise.resolve(options.listEvent)
    : fetchAddressableEventFromRelay({
        WebSocket: options.WebSocket,
        relayUrl: options.relayUrl,
        subject: options.subject,
        timeoutMs: options.timeoutMs,
      }).catch(() => undefined)

  const correctionPromise = typeof options.correctionChannel === 'string'
    ? probeCorrectionChannel(options.correctionChannel, { fetch: options.fetch })
    : Promise.resolve(options.correctionChannel)

  const [listEvent, correctionChannel] = await Promise.all([listEventPromise, correctionPromise])

  return resolveListLabelerCompanionEvidence({
    checkedAt: at,
    correctionChannel,
    listEvent,
    requireSignature: options.requireSignature,
    sampleReview: options.sampleReview,
    subject: options.subject,
  })
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
