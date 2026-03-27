/** A node in the trust graph representing a single subject (user, event, etc.) */
export interface TrustNode {
  pubkey: string
  metrics: Record<string, number>
  endorsements: number
  ringEndorsements: number
  providers: Set<string>
}

/** A directed edge from a provider to a subject, carrying assertion metrics */
export interface TrustEdge {
  from: string
  to: string
  kind: number
  anonymous: boolean
  metrics: Record<string, number>
}

/** The full trust graph: nodes keyed by subject pubkey, plus all edges */
export interface TrustGraph {
  nodes: Map<string, TrustNode>
  edges: TrustEdge[]
}

/** A ranked entry for a single subject after trust scoring */
export interface TrustRank {
  pubkey: string
  rank: number
  endorsements: number
  ringEndorsements: number
  providers: number
}
