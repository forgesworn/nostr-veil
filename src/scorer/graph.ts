import { parseAssertion } from '../nip85/parsers.js'
import type { EventTemplate } from '../nip85/types.js'
import type { TrustGraph, TrustNode, TrustEdge } from './types.js'

/**
 * Builds a trust graph from an array of NIP-85 assertion events.
 *
 * Each unique subject (d-tag value) becomes a node. Each event becomes an edge.
 * Events carrying a `veil-ring` tag are treated as anonymous ring endorsements.
 * Metrics are aggregated on each node (last value wins per metric key).
 *
 * @param events - Array of unsigned NIP-85 assertion events
 * @returns A {@link TrustGraph} with nodes keyed by subject pubkey and all edges
 */
export function buildTrustGraph(events: EventTemplate[]): TrustGraph {
  const nodes = new Map<string, TrustNode>()
  const edges: TrustEdge[] = []

  for (const event of events) {
    const parsed = parseAssertion(event)
    const subject = parsed.subject
    if (subject === '') continue

    const isRing = event.tags.some(t => t[0] === 'veil-ring')

    // Find the provider pubkey from the p-tag
    const pTag = event.tags.find(t => t[0] === 'p')
    const provider = pTag?.[1] ?? ''

    // Convert string metric values to numbers
    const numericMetrics: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed.metrics)) {
      const num = Number(value)
      if (!isNaN(num)) {
        numericMetrics[key] = num
      }
    }

    // Create or update the node
    let node = nodes.get(subject)
    if (!node) {
      node = {
        pubkey: subject,
        metrics: {},
        endorsements: 0,
        ringEndorsements: 0,
        providers: [],
      }
      nodes.set(subject, node)
    }

    // Aggregate metrics (last value wins per key)
    for (const [key, value] of Object.entries(numericMetrics)) {
      node.metrics[key] = value
    }

    // Count endorsements
    if (isRing) {
      node.ringEndorsements++
    } else {
      node.endorsements++
    }

    // Track unique providers
    if (provider !== '' && !node.providers.includes(provider)) {
      node.providers.push(provider)
    }

    // Create the edge
    const edge: TrustEdge = {
      from: provider,
      to: subject,
      kind: event.kind,
      anonymous: isRing,
      metrics: numericMetrics,
    }
    edges.push(edge)
  }

  return { nodes, edges }
}
