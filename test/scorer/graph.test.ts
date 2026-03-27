import { describe, it, expect } from 'vitest'
import { buildTrustGraph } from '../../src/scorer/graph.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'
import type { EventTemplate } from '../../src/nip85/types.js'

const subjectA = 'a'.repeat(64)
const subjectB = 'b'.repeat(64)
const providerX = 'x'.repeat(64)
const providerY = 'y'.repeat(64)

function makeEvent(overrides: Partial<EventTemplate> & { tags: string[][] }): EventTemplate {
  return { kind: NIP85_KINDS.USER, content: '', ...overrides }
}

describe('buildTrustGraph', () => {
  it('returns empty graph for empty events array', () => {
    const graph = buildTrustGraph([])
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toHaveLength(0)
  })

  it('builds one node and one edge from a single user assertion', () => {
    const event = makeEvent({
      tags: [
        ['d', subjectA],
        ['p', providerX],
        ['rank', '85'],
        ['followers', '1200'],
      ],
    })

    const graph = buildTrustGraph([event])

    expect(graph.nodes.size).toBe(1)
    expect(graph.edges).toHaveLength(1)

    const node = graph.nodes.get(subjectA)!
    expect(node.pubkey).toBe(subjectA)
    expect(node.metrics).toEqual({ rank: 85, followers: 1200 })
    expect(node.endorsements).toBe(1)
    expect(node.ringEndorsements).toBe(0)
    expect(node.providers).toEqual([providerX])

    const edge = graph.edges[0]
    expect(edge.from).toBe(providerX)
    expect(edge.to).toBe(subjectA)
    expect(edge.kind).toBe(NIP85_KINDS.USER)
    expect(edge.anonymous).toBe(false)
    expect(edge.metrics).toEqual({ rank: 85, followers: 1200 })
  })

  it('marks ring-endorsed assertions as anonymous', () => {
    const event = makeEvent({
      tags: [
        ['d', subjectA],
        ['p', providerX],
        ['veil-ring', 'proof-data'],
        ['rank', '90'],
      ],
    })

    const graph = buildTrustGraph([event])

    const node = graph.nodes.get(subjectA)!
    expect(node.endorsements).toBe(0)
    expect(node.ringEndorsements).toBe(1)

    const edge = graph.edges[0]
    expect(edge.anonymous).toBe(true)
  })

  it('aggregates metrics from multiple assertions for the same subject', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '70'],
          ['followers', '500'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerY],
          ['rank', '90'],
          ['zap_cnt_recd', '42'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)

    expect(graph.nodes.size).toBe(1)
    expect(graph.edges).toHaveLength(2)

    const node = graph.nodes.get(subjectA)!
    // Last value wins for rank
    expect(node.metrics.rank).toBe(90)
    // Preserved from first event
    expect(node.metrics.followers).toBe(500)
    // Added by second event
    expect(node.metrics.zap_cnt_recd).toBe(42)
    expect(node.endorsements).toBe(2)
    expect(node.ringEndorsements).toBe(0)
  })

  it('deduplicates providers on the same node', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '70'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '75'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const node = graph.nodes.get(subjectA)!
    expect(node.providers).toEqual([providerX])
    expect(node.endorsements).toBe(2)
  })

  it('tracks multiple unique providers on the same node', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '70'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerY],
          ['rank', '80'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const node = graph.nodes.get(subjectA)!
    expect(node.providers).toEqual([providerX, providerY])
  })

  it('creates separate nodes for different subjects', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '80'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectB],
          ['p', providerX],
          ['rank', '60'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    expect(graph.nodes.size).toBe(2)
    expect(graph.edges).toHaveLength(2)
    expect(graph.nodes.get(subjectA)!.metrics.rank).toBe(80)
    expect(graph.nodes.get(subjectB)!.metrics.rank).toBe(60)
  })

  it('skips events with no d-tag (empty subject)', () => {
    const event = makeEvent({
      tags: [
        ['p', providerX],
        ['rank', '85'],
      ],
    })

    const graph = buildTrustGraph([event])
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toHaveLength(0)
  })

  it('handles events with no p-tag (empty provider)', () => {
    const event = makeEvent({
      tags: [
        ['d', subjectA],
        ['rank', '75'],
      ],
    })

    const graph = buildTrustGraph([event])
    const node = graph.nodes.get(subjectA)!
    expect(node.providers).toEqual([])
    expect(node.endorsements).toBe(1)

    const edge = graph.edges[0]
    expect(edge.from).toBe('')
  })

  it('skips non-numeric metric values', () => {
    const event = makeEvent({
      tags: [
        ['d', subjectA],
        ['p', providerX],
        ['rank', '85'],
        ['t', 'bitcoin'],
      ],
    })

    const graph = buildTrustGraph([event])
    const node = graph.nodes.get(subjectA)!
    expect(node.metrics).toEqual({ rank: 85 })
    expect(node.metrics.t).toBeUndefined()
  })

  it('mixes ring and non-ring endorsements for the same subject', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '80'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerY],
          ['veil-ring', 'proof'],
          ['rank', '90'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const node = graph.nodes.get(subjectA)!
    expect(node.endorsements).toBe(1)
    expect(node.ringEndorsements).toBe(1)
    expect(graph.edges[0].anonymous).toBe(false)
    expect(graph.edges[1].anonymous).toBe(true)
  })
})
