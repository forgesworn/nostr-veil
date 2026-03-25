import type { UserMetrics, EventMetrics, IdentifierMetrics, ProviderEntry, EventTemplate } from './types.js'
import { NIP85_KINDS } from './types.js'

type AnyMetrics = UserMetrics | EventMetrics | IdentifierMetrics

function metricsToTags(metrics: AnyMetrics): string[][] {
  return Object.entries(metrics as Record<string, string | number | undefined>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)])
}

/**
 * Build a kind 30382 user assertion event template for the given pubkey.
 *
 * @param pubkey - Hex-encoded x-only public key of the subject (64 chars)
 * @param metrics - {@link UserMetrics} to embed as tags (undefined values are omitted)
 * @returns An unsigned {@link EventTemplate} with `d` and `p` tags set to `pubkey`
 *
 * @example
 * const tmpl = buildUserAssertion(alicePubkey, { rank: 85, followers: 1200 })
 * const event = signEvent(tmpl, providerPrivkey)
 * await relay.publish(event)
 */
export function buildUserAssertion(pubkey: string, metrics: UserMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.USER,
    tags: [
      ['d', pubkey],
      ['p', pubkey],
      ...metricsToTags(metrics),
    ],
    content: '',
  }
}

/**
 * Build a kind 30383 event assertion for the given event ID.
 *
 * @param eventId - Hex-encoded Nostr event ID (64 chars)
 * @param metrics - {@link EventMetrics} to embed as tags (undefined values are omitted)
 * @returns An unsigned {@link EventTemplate} with `d` and `e` tags set to `eventId`
 *
 * @example
 * const tmpl = buildEventAssertion(noteId, { rank: 90, repost_cnt: 42 })
 * const event = signEvent(tmpl, providerPrivkey)
 * await relay.publish(event)
 */
export function buildEventAssertion(eventId: string, metrics: EventMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.EVENT,
    tags: [['d', eventId], ['e', eventId], ...metricsToTags(metrics)],
    content: '',
  }
}

/**
 * Build a kind 30384 addressable assertion for the given NIP-33 address.
 *
 * @param address - NIP-33 address in `kind:pubkey:d-tag` format
 * @param metrics - {@link EventMetrics} to embed as tags (undefined values are omitted)
 * @returns An unsigned {@link EventTemplate} with `d` and `a` tags set to `address`
 *
 * @example
 * const tmpl = buildAddressableAssertion('30023:abc123:my-article', { rank: 70 })
 * const event = signEvent(tmpl, providerPrivkey)
 * await relay.publish(event)
 */
export function buildAddressableAssertion(address: string, metrics: EventMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.ADDRESSABLE,
    tags: [['d', address], ['a', address], ...metricsToTags(metrics)],
    content: '',
  }
}

/**
 * Build a kind 30385 identifier assertion with an explicit k-tag.
 *
 * @param identifier - Opaque identifier string used as the `d`-tag value
 * @param kTag - The kind number (as a string) the identifier belongs to
 * @param metrics - {@link IdentifierMetrics} to embed as tags (undefined values are omitted)
 * @returns An unsigned {@link EventTemplate} with `d` and `k` tags set accordingly
 *
 * @example
 * const tmpl = buildIdentifierAssertion('npub1abc…', '0', { rank: 60, reaction_cnt: 15 })
 * const event = signEvent(tmpl, providerPrivkey)
 * await relay.publish(event)
 */
export function buildIdentifierAssertion(identifier: string, kTag: string, metrics: IdentifierMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.IDENTIFIER,
    tags: [['d', identifier], ['k', kTag], ...metricsToTags(metrics)],
    content: '',
  }
}

/**
 * Build a kind 10040 provider declaration listing which services provide which metrics.
 *
 * When `encryptedContent` is supplied, the tags are omitted from the event and the
 * encrypted blob is placed in `content` instead (NIP-85 encrypted provider mode).
 *
 * @param providers - Array of {@link ProviderEntry} objects mapping `kind:metric` to a service pubkey
 * @param encryptedContent - Optional pre-encrypted tag array; if provided, `tags` will be empty
 * @returns An unsigned {@link EventTemplate} with compound `kind:metric` tag names
 *
 * @example
 * const tmpl = buildProviderDeclaration([
 *   { kind: 30382, metric: 'rank', servicePubkey: providerPubkey, relayHint: 'wss://relay.example.com' },
 * ])
 * const event = signEvent(tmpl, providerPrivkey)
 * await relay.publish(event)
 */
export function buildProviderDeclaration(providers: ProviderEntry[], encryptedContent?: string): EventTemplate {
  const tags = providers.map(p => [`${p.kind}:${p.metric}`, p.servicePubkey, p.relayHint])
  return {
    kind: NIP85_KINDS.PROVIDER,
    tags: encryptedContent ? [] : tags,
    content: encryptedContent ?? '',
  }
}
