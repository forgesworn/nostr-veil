import { describe, it, expect } from 'vitest'
import { buildTrustGraph } from '../../src/scorer/graph.js'
import { computeTrustRank } from '../../src/scorer/rank.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'
import type { EventTemplate } from '../../src/nip85/types.js'
import type { TrustGraph } from '../../src/scorer/types.js'

const subjectA = 'a'.repeat(64)
const subjectB = 'b'.repeat(64)
const subjectC = 'c'.repeat(64)
const providerX = 'x'.repeat(64)
const providerY = 'y'.repeat(64)

function makeEvent(overrides: Partial<EventTemplate> & { tags: string[][] }): EventTemplate {
  return { kind: NIP85_KINDS.USER, content: '', ...overrides }
}

describe('computeTrustRank', () => {
  it('returns empty array for an empty graph', () => {
    const graph: TrustGraph = { nodes: new Map(), edges: [] }
    const ranks = computeTrustRank(graph)
    expect(ranks).toEqual([])
  })

  it('ranks a single non-ring-endorsed subject at 100', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '80'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const ranks = computeTrustRank(graph)

    expect(ranks).toHaveLength(1)
    expect(ranks[0].pubkey).toBe(subjectA)
    expect(ranks[0].rank).toBe(100)
    expect(ranks[0].endorsements).toBe(1)
    expect(ranks[0].ringEndorsements).toBe(0)
    expect(ranks[0].providers).toBe(1)
  })

  it('ranks ring-endorsed subject higher than non-ring-endorsed', () => {
    const events: EventTemplate[] = [
      // subjectA: 1 normal endorsement
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '70'],
        ],
      }),
      // subjectB: 1 ring endorsement (weighted 2x)
      makeEvent({
        tags: [
          ['d', subjectB],
          ['p', providerY],
          ['veil-ring', 'proof'],
          ['rank', '60'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const ranks = computeTrustRank(graph)

    expect(ranks).toHaveLength(2)
    // subjectB has ring endorsement (score = 0 + 2 = 2), subjectA has normal (score = 1 + 0 = 1)
    // theoreticalMax = 1 (normal) + 2 (ring) = 3
    // subjectB rank = round(2/3 * 100) = 67
    // subjectA rank = round(1/3 * 100) = 33
    expect(ranks[0].pubkey).toBe(subjectB)
    expect(ranks[0].rank).toBe(67)
    expect(ranks[1].pubkey).toBe(subjectA)
    expect(ranks[1].rank).toBe(33)
  })

  it('normalises scores to 0-100 scale', () => {
    const events: EventTemplate[] = [
      // subjectA: 2 endorsements (1 normal + 1 ring)
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
      // subjectB: 1 normal endorsement
      makeEvent({
        tags: [
          ['d', subjectB],
          ['p', providerX],
          ['rank', '50'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const ranks = computeTrustRank(graph)

    // theoreticalMax = 1 + 2 + 1 = 4
    // subjectA: score = 1 + (1 * 2) = 3, rank = round(3/4 * 100) = 75
    // subjectB: score = 1, rank = round(1/4 * 100) = 25
    expect(ranks[0].pubkey).toBe(subjectA)
    expect(ranks[0].rank).toBe(75)
    expect(ranks[1].pubkey).toBe(subjectB)
    expect(ranks[1].rank).toBe(25)
  })

  it('returns rank 0 for a subject with no assertions (manually constructed)', () => {
    const graph: TrustGraph = {
      nodes: new Map([
        [subjectA, {
          pubkey: subjectA,
          metrics: {},
          endorsements: 0,
          ringEndorsements: 0,
          providers: new Set<string>(),
        }],
      ]),
      edges: [],
    }

    const ranks = computeTrustRank(graph)
    expect(ranks).toHaveLength(1)
    expect(ranks[0].pubkey).toBe(subjectA)
    expect(ranks[0].rank).toBe(0)
  })

  it('sorts by rank descending, then pubkey ascending for stable ordering', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectC],
          ['p', providerX],
          ['rank', '50'],
        ],
      }),
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
          ['p', providerY],
          ['rank', '60'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const ranks = computeTrustRank(graph)

    // All have the same score (1 endorsement each), so rank is equal
    // theoreticalMax = 3, each score = 1, rank = round(1/3 * 100) = 33
    // Tied ranks should be sorted by pubkey ascending
    expect(ranks[0].pubkey).toBe(subjectA)
    expect(ranks[1].pubkey).toBe(subjectB)
    expect(ranks[2].pubkey).toBe(subjectC)
    expect(ranks.every(r => r.rank === 33)).toBe(true)
  })

  it('includes correct provider count', () => {
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
          ['rank', '85'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['rank', '90'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const ranks = computeTrustRank(graph)

    expect(ranks[0].providers).toBe(2)
  })

  it('handles all-ring graph correctly', () => {
    const events: EventTemplate[] = [
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerX],
          ['veil-ring', 'proof1'],
          ['rank', '80'],
        ],
      }),
      makeEvent({
        tags: [
          ['d', subjectA],
          ['p', providerY],
          ['veil-ring', 'proof2'],
          ['rank', '90'],
        ],
      }),
    ]

    const graph = buildTrustGraph(events)
    const ranks = computeTrustRank(graph)

    // score = 0 + (2 * 2) = 4, theoreticalMax = 2 + 2 = 4, rank = 100
    expect(ranks[0].rank).toBe(100)
    expect(ranks[0].ringEndorsements).toBe(2)
    expect(ranks[0].endorsements).toBe(0)
  })
})
