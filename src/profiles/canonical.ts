import type { SubjectFormat } from './types.js'

const HEX64_RE = /^[0-9a-f]{64}$/
const ADDRESS_RE = /^(0|[1-9]\d*):[0-9a-f]{64}:.+$/
const DECIMAL_KIND_RE = /^(0|[1-9]\d*)$/
const PACKAGE_RE = /^npm:(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+@[^@\s]+$/
const SLUG_RE = /^[a-z0-9._-]+$/

function trimRequired(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error(`${label} must be non-empty`)
  return trimmed
}

function trimNoWhitespace(value: string, label: string): string {
  const trimmed = trimRequired(value, label)
  if (/\s/.test(trimmed)) throw new Error(`${label} must not contain whitespace`)
  return trimmed
}

function assertHex64(value: string, label: string): string {
  const normalised = trimRequired(value, label).toLowerCase()
  if (!HEX64_RE.test(normalised)) {
    throw new Error(`${label} must be a 64-character lowercase hex string`)
  }
  return normalised
}

function stripPrefix(value: string, prefix: string): string {
  return value.toLowerCase().startsWith(prefix) ? value.slice(prefix.length) : value
}

function normaliseHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/\.$/, '')
  if (hostname === '' || hostname.includes('..') || /\s/.test(hostname)) {
    throw new Error('domain must be a non-empty hostname')
  }
  return hostname
}

function normaliseSlug(value: string, label: string): string {
  const slug = trimRequired(value, label).toLowerCase()
  if (!SLUG_RE.test(slug)) {
    throw new Error(`${label} must be a lowercase slug`)
  }
  return slug
}

function canonicalUrl(value: string, label: string, allowedProtocols: string[]): string {
  const url = new URL(trimRequired(value, label))
  const protocol = url.protocol.toLowerCase()
  if (!allowedProtocols.includes(protocol)) {
    throw new Error(`${label} must use one of: ${allowedProtocols.join(', ')}`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(`${label} must not contain username or password`)
  }
  url.protocol = protocol
  url.hostname = normaliseHostname(url.hostname)
  url.hash = ''
  url.search = ''
  if (url.pathname === '/') url.pathname = ''
  const serialised = url.toString()
  return serialised.endsWith('/') ? serialised.slice(0, -1) : serialised
}

function parseNameAtDomain(rawValue: string, label: string): { name: string, domain: string } {
  const raw = trimRequired(rawValue, label)
  const [name, domain, ...extra] = raw.split('@')
  if (name === '' || domain === undefined || domain === '' || extra.length > 0 || /\s/.test(raw)) {
    throw new Error(`${label} must be name@domain`)
  }
  return { name, domain: normaliseHostname(domain) }
}

function normaliseEndpoint(endpoint: string, label: string): string {
  const raw = trimRequired(endpoint, label)
  if (raw.includes('://')) {
    return canonicalUrl(raw, label, ['http:', 'https:', 'ws:', 'wss:'])
  }
  const value = raw.replace(/\/$/, '')
  if (value.includes('/')) throw new Error(`${label} must be a hostname or URL`)
  return normaliseHostname(value)
}

/** Canonical 64-char lowercase hex pubkey subject. */
export function canonicalPubkeySubject(pubkey: string): string {
  return assertHex64(pubkey, 'pubkey')
}

/** Canonical 64-char lowercase hex event id subject. */
export function canonicalEventSubject(eventId: string): string {
  return assertHex64(eventId, 'event id')
}

/** Canonical NIP-33 address subject: `kind:pubkey:d-tag`. */
export function canonicalAddressSubject(kind: number | string, pubkey: string, dTag: string): string {
  const kindText = String(kind)
  if (!DECIMAL_KIND_RE.test(kindText)) {
    throw new Error('address kind must be a decimal kind number')
  }
  const identifier = trimRequired(dTag, 'd-tag')
  return `${kindText}:${canonicalPubkeySubject(pubkey)}:${identifier}`
}

/** Canonical relay identifier subject: `relay:wss://host[/path]`. */
export function canonicalRelaySubject(relay: string): string {
  const raw = stripPrefix(trimRequired(relay, 'relay'), 'relay:')
  const url = new URL(raw)
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
    throw new Error('relay subject must use ws:// or wss://')
  }
  url.protocol = url.protocol.toLowerCase()
  url.hostname = normaliseHostname(url.hostname)
  url.hash = ''
  if (url.pathname === '/') url.pathname = ''
  const serialised = url.toString()
  return `relay:${serialised.endsWith('/') && url.search === '' ? serialised.slice(0, -1) : serialised}`
}

/** Canonical NIP-05 identifier subject. Domain is lowercased; local part is preserved. */
export function canonicalNip05Subject(identifier: string): string {
  const raw = stripPrefix(trimRequired(identifier, 'nip05 identifier'), 'nip05:')
  const { name, domain } = parseNameAtDomain(raw, 'NIP-05 subject')
  return `nip05:${name}@${domain}`
}

/** Canonical domain identifier subject: `domain:example.com`. */
export function canonicalDomainSubject(domain: string): string {
  const raw = stripPrefix(trimRequired(domain, 'domain'), 'domain:')
  const hostname = raw.includes('://')
    ? new URL(raw).hostname
    : raw
  return `domain:${normaliseHostname(hostname)}`
}

/** Canonical npm package release subject: `npm:package@version`. */
export function canonicalNpmPackageSubject(name: string, version: string): string {
  const packageName = trimRequired(name, 'package name').toLowerCase()
  const packageVersion = trimRequired(version, 'package version')
  const subject = `npm:${packageName}@${packageVersion}`
  if (!PACKAGE_RE.test(subject)) {
    throw new Error('npm package subject must be npm:package@version')
  }
  return subject
}

/** Canonical git repository or revision subject: `git:https://host/path[@ref]`. */
export function canonicalGitRepositorySubject(repository: string, ref?: string): string {
  const raw = stripPrefix(trimRequired(repository, 'git repository'), 'git:')
  let repositoryUrl = raw
  let repositoryRef = ref
  if (repositoryRef === undefined) {
    const separator = raw.lastIndexOf('@')
    const schemeIndex = raw.indexOf('://')
    if (separator > schemeIndex + 2) {
      repositoryUrl = raw.slice(0, separator)
      repositoryRef = raw.slice(separator + 1)
    }
  }
  const url = new URL(repositoryUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('git repository subject must use http:// or https://')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('git repository subject must not contain username or password')
  }
  url.protocol = url.protocol.toLowerCase()
  url.hostname = normaliseHostname(url.hostname)
  url.hash = ''
  url.search = ''
  let pathname = url.pathname.replace(/\/+$/, '')
  if (pathname.endsWith('.git')) pathname = pathname.slice(0, -'.git'.length)
  if (pathname === '' || pathname === '/' || /\s/.test(pathname)) {
    throw new Error('git repository subject must include a repository path')
  }
  url.pathname = pathname
  const serialised = url.toString().replace(/\/$/, '')
  const refSuffix = repositoryRef === undefined
    ? ''
    : `@${trimNoWhitespace(repositoryRef, 'git ref')}`
  return `git:${serialised}${refSuffix}`
}

/** Canonical GitHub repository or revision subject. Owner and repo are lowercased. */
export function canonicalGithubRepositorySubject(owner: string, repo: string, ref?: string): string {
  const ownerSlug = normaliseSlug(owner, 'GitHub owner')
  const repoSlug = normaliseSlug(repo, 'GitHub repository')
  return canonicalGitRepositorySubject(`https://github.com/${ownerSlug}/${repoSlug}`, ref)
}

/** Canonical maintainer identity subject: `maintainer:service:account`. */
export function canonicalMaintainerSubject(service: string, account: string): string {
  return `maintainer:${normaliseSlug(service, 'maintainer service')}:${normaliseSlug(account, 'maintainer account')}`
}

/** Canonical service endpoint subject: `service:class:host-or-url`. */
export function canonicalServiceSubject(serviceClass: string, endpoint: string): string {
  return `service:${normaliseSlug(serviceClass, 'service class')}:${normaliseEndpoint(endpoint, 'service endpoint')}`
}

/** Canonical LNURLp/LUD-16 payment identifier subject: `lnurlp:name@domain`. */
export function canonicalLnurlpSubject(identifier: string): string {
  const raw = stripPrefix(trimRequired(identifier, 'LNURLp identifier'), 'lnurlp:')
  const { name, domain } = parseNameAtDomain(raw, 'LNURLp subject')
  return `lnurlp:${name}@${domain}`
}

/** Canonical NIP-96 upload endpoint subject: `nip96:https://host[/path]`. */
export function canonicalNip96Subject(endpoint: string): string {
  const raw = stripPrefix(trimRequired(endpoint, 'NIP-96 endpoint'), 'nip96:')
  return `nip96:${canonicalUrl(raw, 'NIP-96 endpoint', ['https:', 'http:'])}`
}

/** Canonical vendor identifier subject scoped to a marketplace hostname. */
export function canonicalVendorSubject(marketplace: string, vendorId: string): string {
  return `vendor:${normaliseHostname(marketplace)}:${trimNoWhitespace(vendorId, 'vendor id')}`
}

/** Canonical source identifier subject scoped to an application namespace. */
export function canonicalSourceSubject(namespace: string, sourceId: string): string {
  return `source:${normaliseSlug(namespace, 'source namespace')}:${trimNoWhitespace(sourceId, 'source id')}`
}

function canonicalNpmPackageSubjectFromSubject(subject: string): string {
  if (!subject.startsWith('npm:')) throw new Error('npm package subject must start with npm:')
  const spec = subject.slice('npm:'.length)
  const versionSeparator = spec.lastIndexOf('@')
  if (versionSeparator <= 0 || versionSeparator === spec.length - 1) {
    throw new Error('npm package subject must be npm:package@version')
  }
  return canonicalNpmPackageSubject(spec.slice(0, versionSeparator), spec.slice(versionSeparator + 1))
}

function canonicalMaintainerSubjectFromSubject(subject: string): string {
  if (!subject.startsWith('maintainer:')) throw new Error('maintainer subject must start with maintainer:')
  const rest = subject.slice('maintainer:'.length)
  const separator = rest.indexOf(':')
  if (separator <= 0 || separator === rest.length - 1) {
    throw new Error('maintainer subject must be maintainer:service:account')
  }
  return canonicalMaintainerSubject(rest.slice(0, separator), rest.slice(separator + 1))
}

function canonicalServiceSubjectFromSubject(subject: string): string {
  if (!subject.startsWith('service:')) throw new Error('service subject must start with service:')
  const rest = subject.slice('service:'.length)
  const separator = rest.indexOf(':')
  if (separator <= 0 || separator === rest.length - 1) {
    throw new Error('service subject must be service:class:endpoint')
  }
  return canonicalServiceSubject(rest.slice(0, separator), rest.slice(separator + 1))
}

function canonicalVendorSubjectFromSubject(subject: string): string {
  if (!subject.startsWith('vendor:')) throw new Error('vendor subject must start with vendor:')
  const rest = subject.slice('vendor:'.length)
  const separator = rest.indexOf(':')
  if (separator <= 0 || separator === rest.length - 1) {
    throw new Error('vendor subject must be vendor:marketplace:vendor-id')
  }
  return canonicalVendorSubject(rest.slice(0, separator), rest.slice(separator + 1))
}

function canonicalSourceSubjectFromSubject(subject: string): string {
  if (!subject.startsWith('source:')) throw new Error('source subject must start with source:')
  const rest = subject.slice('source:'.length)
  const separator = rest.indexOf(':')
  if (separator <= 0 || separator === rest.length - 1) {
    throw new Error('source subject must be source:namespace:source-id')
  }
  return canonicalSourceSubject(rest.slice(0, separator), rest.slice(separator + 1))
}

function matchesCanonical(subject: string, canonicalise: (value: string) => string): boolean {
  try {
    return canonicalise(subject) === subject
  } catch {
    return false
  }
}

export function subjectMatchesFormat(subject: string, format: SubjectFormat): boolean {
  switch (format) {
    case 'pubkey':
    case 'event':
      return HEX64_RE.test(subject)
    case 'address':
      return ADDRESS_RE.test(subject)
    case 'identifier':
      return subject.trim() !== ''
    case 'relay':
      return matchesCanonical(subject, canonicalRelaySubject)
    case 'nip05':
      return matchesCanonical(subject, canonicalNip05Subject)
    case 'domain':
      return matchesCanonical(subject, canonicalDomainSubject)
    case 'git':
      return matchesCanonical(subject, canonicalGitRepositorySubject)
    case 'lnurlp':
      return matchesCanonical(subject, canonicalLnurlpSubject)
    case 'maintainer':
      return matchesCanonical(subject, canonicalMaintainerSubjectFromSubject)
    case 'nip96':
      return matchesCanonical(subject, canonicalNip96Subject)
    case 'package':
      return matchesCanonical(subject, canonicalNpmPackageSubjectFromSubject)
    case 'service':
      return matchesCanonical(subject, canonicalServiceSubjectFromSubject)
    case 'vendor':
      return matchesCanonical(subject, canonicalVendorSubjectFromSubject)
    case 'source':
      return matchesCanonical(subject, canonicalSourceSubjectFromSubject)
  }
}

export function subjectMatchesAnyFormat(subject: string, formats: SubjectFormat[]): boolean {
  return formats.some(format => subjectMatchesFormat(subject, format))
}
