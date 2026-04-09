import { useState, useCallback } from 'react'

export type Screen = 'welcome' | 'circle' | 'source' | 'veil' | 'verification' | 'reveal' | 'network'

export type IdentityMode = 'demo' | 'heartwood' | null

const SCREEN_ORDER: Screen[] = ['welcome', 'circle', 'source', 'veil', 'verification', 'reveal', 'network']

/** Total ring signature contributors (user + NPCs). */
export const CONTRIBUTOR_COUNT = 3

export interface GeneratedEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface VeilFlowState {
  screen: Screen
  identityMode: IdentityMode
  selectedJournalistIndex: number | null
  /** Indices of the journalists who contribute to the ring signature. */
  contributorIndices: Set<number>
  scores: Map<number, number>
  aggregatedEvent: unknown | null
  proofResult: unknown | null
  disclosureProofs: unknown | null
  /** Signed Nostr events collected during the demo flow for display on the recap screen. */
  generatedEvents: GeneratedEvent[]
}

export function useVeilFlow(ringSize: number) {
  const [state, setState] = useState<VeilFlowState>({
    screen: 'welcome',
    identityMode: null,
    selectedJournalistIndex: null,
    contributorIndices: new Set(),
    scores: new Map(),
    aggregatedEvent: null,
    proofResult: null,
    disclosureProofs: null,
    generatedEvents: [],
  })

  const goTo = useCallback((screen: Screen) => {
    setState(s => ({ ...s, screen }))
  }, [])

  const next = useCallback(() => {
    setState(s => {
      const idx = SCREEN_ORDER.indexOf(s.screen)
      const nextScreen = SCREEN_ORDER[Math.min(idx + 1, SCREEN_ORDER.length - 1)]
      return { ...s, screen: nextScreen }
    })
  }, [])

  const selectJournalist = useCallback((index: number) => {
    // Pre-compute which journalists will contribute to the ring.
    // Always includes the user's selected journalist + random others.
    const indices = new Set<number>([index])
    const pool = Array.from({ length: ringSize }, (_, i) => i).filter(i => i !== index)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]]
    }
    for (const idx of pool) {
      if (indices.size >= CONTRIBUTOR_COUNT) break
      indices.add(idx)
    }
    setState(s => ({ ...s, selectedJournalistIndex: index, contributorIndices: indices }))
  }, [ringSize])

  const setScore = useCallback((journalistIndex: number, rank: number) => {
    setState(s => {
      const scores = new Map(s.scores)
      scores.set(journalistIndex, rank)
      return { ...s, scores }
    })
  }, [])

  const setAggregatedEvent = useCallback((event: unknown) => {
    setState(s => ({ ...s, aggregatedEvent: event }))
  }, [])

  const setProofResult = useCallback((result: unknown) => {
    setState(s => ({ ...s, proofResult: result }))
  }, [])

  const setDisclosureProofs = useCallback((proofs: unknown) => {
    setState(s => ({ ...s, disclosureProofs: proofs }))
  }, [])

  const setIdentityMode = useCallback((mode: IdentityMode) => {
    setState(s => ({ ...s, identityMode: mode }))
  }, [])

  const addGeneratedEvent = useCallback((event: GeneratedEvent) => {
    setState(s => ({ ...s, generatedEvents: [...s.generatedEvents, event] }))
  }, [])

  return { state, goTo, next, selectJournalist, setScore, setAggregatedEvent, setProofResult, setDisclosureProofs, setIdentityMode, addGeneratedEvent }
}
