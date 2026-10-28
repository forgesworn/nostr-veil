import { GENERAL_TAGS } from '../nip85/tags.js'

/**
 * Every metric name in a contribution becomes a tag on the published event,
 * and a metric that only one contributor supplies is aggregated from that one
 * value. A metric name that is also a tag with meaning elsewhere in Nostr
 * would let a single circle member change how relays and clients treat the
 * whole event, for example `expiration` (relays drop it), `-` (NIP-70
 * protected), `content-warning` (clients hide it) or any single-letter tag
 * (relay-indexed, so `t`, `r` or `g` would put it into hashtag, URL or
 * geohash queries).
 *
 * `__proto__` is reserved because a plain object silently drops it, so the
 * signed metrics and the published tags would disagree.
 *
 * Tags such as `delegation`, `proxy`, `imeta` or `relays` are not listed:
 * metric values are numbers, which cannot form a meaningful value for them.
 *
 * Internal: not re-exported from `nostr-veil/proof`.
 */
const RESERVED_METRIC_NAMES: ReadonlySet<string> = new Set([
  'd', 'p', 'e', 'a', 'k',
  ...GENERAL_TAGS,
  'content-warning',
])

/** Why `name` cannot be a metric name, or `undefined` when it can. */
export function reservedMetricNameReason(name: string): string | undefined {
  if (name.startsWith('veil-')) return `Metric name "${name}" is reserved: veil-* tags carry the proof`
  if ([...name].length === 1) return `Metric name "${name}" is reserved: single-character tags are relay-indexed`
  if (name === '__proto__') return `Metric name "${name}" is reserved: it cannot be stored as a plain object key`
  if (RESERVED_METRIC_NAMES.has(name)) return `Metric name "${name}" is reserved: it is a Nostr tag with its own meaning`
  return undefined
}

/** Throws if any metric name is reserved. */
export function assertMetricNamesAllowed(metrics: Record<string, unknown>): void {
  for (const name of Object.keys(metrics)) {
    const reason = reservedMetricNameReason(name)
    if (reason !== undefined) throw new Error(reason)
  }
}

/**
 * Tags the publisher of a veil event may set: NIP-40 `expiration` and NIP-31
 * `alt`. The circle does not sign them; the publisher's Nostr signature covers
 * them, as it covers `content`. Both names are also reserved above, so a tag
 * with one of these names can never be a signed metric.
 *
 * Internal: not re-exported from `nostr-veil/proof`.
 */
export const PUBLISHER_TAGS: ReadonlySet<string> = new Set(['expiration', 'alt'])
