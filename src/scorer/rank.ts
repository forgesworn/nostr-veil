import type { TrustGraph, TrustRank } from './types.js'

/**
 * Computes trust rankings from a trust graph.
 *
 * Ring endorsements are weighted 2x:
 * `score = endorsements + (ringEndorsements * 2)`
 *
 * Scores are normalised to a 0-100 scale against the theoretical maximum
 * for the graph (total edges, with each ring edge counting double).
 *
 * @param graph - A {@link TrustGraph} produced by `buildTrustGraph`
 * @returns An array of {@link TrustRank} entries sorted by rank descending
 */
export function computeTrustRank(graph: TrustGraph): TrustRank[] {
  if (graph.nodes.size === 0) return []

  // Calculate theoretical max: total edges with ring edges counting double
  let theoreticalMax = 0
  for (const edge of graph.edges) {
    theoreticalMax += edge.anonymous ? 2 : 1
  }

  // Avoid division by zero when there are nodes but no meaningful edges
  if (theoreticalMax === 0) theoreticalMax = 1

  const ranks: TrustRank[] = []

  for (const [pubkey, node] of graph.nodes) {
    const rawScore = node.endorsements + (node.ringEndorsements * 2)
    const rank = Math.round((rawScore / theoreticalMax) * 100)

    ranks.push({
      pubkey,
      rank,
      endorsements: node.endorsements,
      ringEndorsements: node.ringEndorsements,
      providers: node.providers.length,
    })
  }

  // Sort by rank descending, then by pubkey for stable ordering
  ranks.sort((a, b) => b.rank - a.rank || a.pubkey.localeCompare(b.pubkey))

  return ranks
}
