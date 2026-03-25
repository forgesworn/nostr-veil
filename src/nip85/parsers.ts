import type { ParsedAssertion, ParsedProvider } from './types.js'

/** Tags that carry structural metadata rather than assertion metrics */
const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

interface RawEvent {
  kind: number
  tags: string[][]
  content: string
}

/**
 * Extracts the subject (d-tag value) and metric tags from a NIP-85 assertion event.
 * Skips known meta tags (`d`, `p`, `e`, `a`, `k`) and any tag whose name starts with `veil_`.
 */
export function parseAssertion(event: RawEvent): ParsedAssertion {
  const dTag = event.tags.find(t => t[0] === 'd')
  const subject = dTag?.[1] ?? ''

  const metrics: Record<string, string | number> = {}
  for (const tag of event.tags) {
    const name = tag[0]
    if (META_TAGS.has(name) || name.startsWith('veil_')) continue
    if (tag[1] !== undefined) {
      metrics[name] = tag[1]
    }
  }

  return { kind: event.kind, subject, metrics }
}

/**
 * Parses a NIP-85 provider declaration event (kind 10040).
 *
 * Tag names use the compound `kind:metric` format.
 * When the event has non-empty content and a `decryptFn` is supplied, the
 * function calls `decryptFn(content)` and parses the decrypted value as a
 * JSON-encoded tag array instead of reading `event.tags`.
 */
export function parseProviderDeclaration(event: RawEvent): ParsedProvider[]
export function parseProviderDeclaration(
  event: RawEvent,
  decryptFn: (ciphertext: string) => Promise<string>,
): Promise<ParsedProvider[]>
export function parseProviderDeclaration(
  event: RawEvent,
  decryptFn?: (ciphertext: string) => Promise<string>,
): ParsedProvider[] | Promise<ParsedProvider[]> {
  if (decryptFn && event.content !== '') {
    return decryptFn(event.content).then(plaintext => {
      const tags: string[][] = JSON.parse(plaintext)
      return extractProviderEntries(tags)
    })
  }
  return extractProviderEntries(event.tags)
}

function extractProviderEntries(tags: string[][]): ParsedProvider[] {
  const entries: ParsedProvider[] = []
  for (const tag of tags) {
    const colonIdx = tag[0].indexOf(':')
    if (colonIdx === -1) continue
    const kindStr = tag[0].slice(0, colonIdx)
    const metric = tag[0].slice(colonIdx + 1)
    const kind = Number(kindStr)
    if (!Number.isInteger(kind) || isNaN(kind)) continue
    entries.push({
      kind,
      metric,
      servicePubkey: tag[1] ?? '',
      relayHint: tag[2] ?? '',
    })
  }
  return entries
}
