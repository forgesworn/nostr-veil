/**
 * Tags that any Nostr event may carry and that are never NIP-85 metrics:
 * NIP-40 `expiration`, NIP-31 `alt`, NIP-89 `client`, NIP-32 `L`/`l` labels,
 * the NIP-73 `i` identifier, the NIP-70 `-` protected marker and the NIP-13
 * `nonce`. Strict validation does not read them as metrics, and the proof
 * layer reserves them so they can never be signed as metrics.
 *
 * Internal: not re-exported from `nostr-veil/nip85`.
 */
export const GENERAL_TAGS: ReadonlySet<string> = new Set([
  'expiration',
  'alt',
  'client',
  'L',
  'l',
  'i',
  '-',
  'nonce',
])

/**
 * Tags the publisher of a veil event may set: NIP-40 `expiration` and NIP-31
 * `alt`. The circle does not sign them; the publisher's Nostr signature covers
 * them, as it covers `content`. Both are in GENERAL_TAGS, which the proof layer
 * reserves as metric names, so a tag with one of these names can never be a
 * signed metric.
 *
 * Internal: not re-exported from `nostr-veil/nip85`.
 */
export const PUBLISHER_TAGS: ReadonlySet<string> = new Set(['expiration', 'alt'])

const DECIMAL_INTEGER_RE = /^(0|[1-9]\d*)$/

/**
 * True when `value` is a valid NIP-40 `expiration` value: a unix timestamp in
 * seconds, written as a canonical decimal string that fits a safe integer.
 *
 * Internal: not re-exported from `nostr-veil/nip85`.
 */
export function isUnixSecondsTagValue(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_INTEGER_RE.test(value) && Number.isSafeInteger(Number(value))
}
