import type { UserMetrics, EventMetrics, IdentifierMetrics, ProviderEntry, EventTemplate } from './types.js'
import { NIP85_KINDS } from './types.js'

type AnyMetrics = UserMetrics | EventMetrics | IdentifierMetrics

function metricsToTags(metrics: AnyMetrics): string[][] {
  return Object.entries(metrics as Record<string, string | number | undefined>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)])
}

/** Build a kind 30382 user assertion event template for the given pubkey. */
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

/** Build a kind 30383 event assertion for the given event ID. */
export function buildEventAssertion(eventId: string, metrics: EventMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.EVENT,
    tags: [['d', eventId], ['e', eventId], ...metricsToTags(metrics)],
    content: '',
  }
}

/** Build a kind 30384 addressable assertion for the given NIP-33 address. */
export function buildAddressableAssertion(address: string, metrics: EventMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.ADDRESSABLE,
    tags: [['d', address], ['a', address], ...metricsToTags(metrics)],
    content: '',
  }
}

/** Build a kind 30385 identifier assertion with an explicit k-tag. */
export function buildIdentifierAssertion(identifier: string, kTag: string, metrics: IdentifierMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.IDENTIFIER,
    tags: [['d', identifier], ['k', kTag], ...metricsToTags(metrics)],
    content: '',
  }
}

/** Build a kind 10040 provider declaration listing which services provide which metrics. */
export function buildProviderDeclaration(providers: ProviderEntry[], encryptedContent?: string): EventTemplate {
  const tags = providers.map(p => [`${p.kind}:${p.metric}`, p.servicePubkey, p.relayHint])
  return {
    kind: NIP85_KINDS.PROVIDER,
    tags: encryptedContent ? [] : tags,
    content: encryptedContent ?? '',
  }
}
