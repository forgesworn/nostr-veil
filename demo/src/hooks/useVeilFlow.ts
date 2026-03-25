import { useState, useCallback } from 'react'

export type Screen = 'circle' | 'source' | 'veil' | 'verification' | 'reveal'

const SCREEN_ORDER: Screen[] = ['circle', 'source', 'veil', 'verification', 'reveal']

export interface VeilFlowState {
  screen: Screen
  selectedJournalistIndex: number | null
  scores: Map<number, number>
  aggregatedEvent: unknown | null
  proofResult: unknown | null
  disclosureProofs: unknown | null
}

export function useVeilFlow() {
  const [state, setState] = useState<VeilFlowState>({
    screen: 'circle',
    selectedJournalistIndex: null,
    scores: new Map(),
    aggregatedEvent: null,
    proofResult: null,
    disclosureProofs: null,
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
    setState(s => ({ ...s, selectedJournalistIndex: index }))
  }, [])

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

  return { state, goTo, next, selectJournalist, setScore, setAggregatedEvent, setProofResult, setDisclosureProofs }
}
