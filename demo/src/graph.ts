/**
 * Local graph-building utility for the demo.
 * The library's graph module was removed in the nip85+proof refactor;
 * this inlines the minimal logic the demo needs.
 */

import type { EventTemplate } from 'nostr-veil/nip85'

export interface TrustNode {
  pubkey: string
  endorsements: number
  ringEndorsements: number
  providers: string[]
  metrics: Record<string, number>
}

export interface TrustEdge {
  from: string
  to: string
  anonymous: boolean
}

export interface TrustGraph {
  nodes: Map<string, TrustNode>
  edges: TrustEdge[]
}

function getOrCreate(nodes: Map<string, TrustNode>, pubkey: string): TrustNode {
  let node = nodes.get(pubkey)
  if (!node) {
    node = { pubkey, endorsements: 0, ringEndorsements: 0, providers: [], metrics: {} }
    nodes.set(pubkey, node)
  }
  return node
}

/** Build a lightweight trust graph from NIP-85-shaped event templates. */
export function buildTrustGraph(events: EventTemplate[]): TrustGraph {
  const nodes = new Map<string, TrustNode>()
  const edges: TrustEdge[] = []

  for (const evt of events) {
    const dTag = evt.tags.find(t => t[0] === 'd')
    const pTag = evt.tags.find(t => t[0] === 'p')
    const isRing = evt.tags.some(t => t[0] === 'veil-ring')

    if (!dTag) continue
    const subject = dTag[1]
    const subjectNode = getOrCreate(nodes, subject)

    // Extract numeric metrics from tags
    for (const tag of evt.tags) {
      if (['d', 'p', 'veil-ring', 'veil-threshold', 'veil-sig'].includes(tag[0])) continue
      const val = Number(tag[1])
      if (!Number.isNaN(val)) {
        subjectNode.metrics[tag[0]] = val
      }
    }

    if (isRing) {
      subjectNode.ringEndorsements++
      // Ring members all connect to the subject anonymously
      const ringTag = evt.tags.find(t => t[0] === 'veil-ring')
      if (ringTag) {
        for (let i = 1; i < ringTag.length; i++) {
          const memberPk = ringTag[i]
          getOrCreate(nodes, memberPk)
          edges.push({ from: memberPk, to: subject, anonymous: true })
        }
      }
    } else if (pTag) {
      const provider = pTag[1]
      getOrCreate(nodes, provider)
      subjectNode.endorsements++
      if (!subjectNode.providers.includes(provider)) {
        subjectNode.providers.push(provider)
      }
      edges.push({ from: provider, to: subject, anonymous: false })
    }
  }

  return { nodes, edges }
}
