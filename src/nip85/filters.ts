import { NIP85_KINDS } from './types.js'

export interface NostrFilter {
  kinds?: number[]
  authors?: string[]
  '#d'?: string[]
  [key: string]: unknown
}

/**
 * Builds a relay query filter for NIP-85 assertion events.
 *
 * @param params - Filter parameters
 * @param params.kind - The assertion kind (30382–30385)
 * @param params.subject - Optional subject pubkey / identifier to filter by `#d`
 * @param params.provider - Optional provider pubkey to filter by `authors`
 * @returns A {@link NostrFilter} ready to pass to a relay subscription
 *
 * @example
 * const filter = assertionFilter({ kind: 30382, subject: alicePubkey, provider: providerPubkey })
 * relay.subscribe([filter], onEvent)
 */
export function assertionFilter(params: {
  kind: number
  subject?: string
  provider?: string
}): NostrFilter {
  const filter: NostrFilter = { kinds: [params.kind] }
  if (params.subject !== undefined) {
    filter['#d'] = [params.subject]
  }
  if (params.provider !== undefined) {
    filter.authors = [params.provider]
  }
  return filter
}

/**
 * Builds a relay query filter for a provider's kind 10040 declaration event.
 *
 * @param pubkey - The provider's hex-encoded public key (64 chars)
 * @returns A {@link NostrFilter} scoped to kind 10040 for the given author
 *
 * @example
 * const filter = providerFilter(providerPubkey)
 * relay.subscribe([filter], onProviderDeclaration)
 */
export function providerFilter(pubkey: string): NostrFilter {
  return {
    kinds: [NIP85_KINDS.PROVIDER],
    authors: [pubkey],
  }
}
