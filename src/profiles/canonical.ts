import type { SubjectFormat } from './types.js'

const HEX64_RE = /^[0-9a-f]{64}$/
const ADDRESS_RE = /^(0|[1-9]\d*):[0-9a-f]{64}:.+$/
const DECIMAL_KIND_RE = /^(0|[1-9]\d*)$/
const PACKAGE_RE = /^npm:(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+@[^@\s]+$/

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
  const [name, domain, ...extra] = raw.split('@')
  if (name === '' || domain === undefined || domain === '' || extra.length > 0 || /\s/.test(raw)) {
    throw new Error('NIP-05 subject must be name@domain')
  }
  return `nip05:${name}@${normaliseHostname(domain)}`
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

/** Canonical vendor identifier subject scoped to a marketplace hostname. */
export function canonicalVendorSubject(marketplace: string, vendorId: string): string {
  return `vendor:${normaliseHostname(marketplace)}:${trimNoWhitespace(vendorId, 'vendor id')}`
}

/** Canonical source identifier subject scoped to an application namespace. */
export function canonicalSourceSubject(namespace: string, sourceId: string): string {
  const ns = trimRequired(namespace, 'source namespace').toLowerCase()
  if (!/^[a-z0-9._-]+$/.test(ns)) {
    throw new Error('source namespace must be a lowercase slug')
  }
  return `source:${ns}:${trimNoWhitespace(sourceId, 'source id')}`
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
    case 'package':
      return matchesCanonical(subject, canonicalNpmPackageSubjectFromSubject)
    case 'vendor':
      return matchesCanonical(subject, canonicalVendorSubjectFromSubject)
    case 'source':
      return matchesCanonical(subject, canonicalSourceSubjectFromSubject)
  }
}

export function subjectMatchesAnyFormat(subject: string, formats: SubjectFormat[]): boolean {
  return formats.some(format => subjectMatchesFormat(subject, format))
}
