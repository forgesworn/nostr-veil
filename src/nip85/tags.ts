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
