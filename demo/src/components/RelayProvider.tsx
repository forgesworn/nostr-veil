import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { SimplePool, type Event as NostrEvent } from 'nostr-tools'
import { buildTrustGraph, type TrustGraph } from '../graph.js'
import { NIP85_KINDS, type EventTemplate } from 'nostr-veil/nip85'
import { journalists } from '../data/journalists.js'
import { source } from '../data/source.js'

interface RelayState {
  graph: TrustGraph
  events: EventTemplate[]
  loading: boolean
  error: string | null
  eventLog: EventLogEntry[]
  addLogEntry: (entry: EventLogEntry) => void
}

export interface EventLogEntry {
  kind: number
  subject: string
  anonymous: boolean
  timestamp: number
  description?: string
  separator?: string  // screen transition marker, e.g. "THE VEIL"
}

const emptyGraph: TrustGraph = { nodes: new Map(), edges: [] }

const RelayContext = createContext<RelayState>({
  graph: emptyGraph,
  events: [],
  loading: false,
  addLogEntry: () => {},
  error: null,
  eventLog: [],
})

export function useRelay() {
  return useContext(RelayContext)
}

const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol']

/** Generate demo data using the same 8 journalists + 1 source from the story */
function generateDemoEvents(): EventTemplate[] {
  const pubkeys = journalists.map(j => j.publicKey)
  const sourcePk = source.publicKey
  const events: EventTemplate[] = []
  const now = Math.floor(Date.now() / 1000)

  // Each journalist rates the source (standard assertions)
  const ranks = [85, 78, 92, 70, 88, 65, 80, 73]
  const followers = [1200, 800, 2500, 450, 1800, 350, 1100, 600]
  for (let i = 0; i < pubkeys.length; i++) {
    events.push({
      kind: NIP85_KINDS.USER,
      tags: [
        ['d', sourcePk],
        ['p', pubkeys[i]],
        ['rank', String(ranks[i])],
        ['followers', String(followers[i])],
      ],
      content: '',
      created_at: now - 3600 + i * 120,
    })
  }

  // Cross-member endorsements (journalists rating each other)
  const crossEdges: [number, number, number][] = [
    [0, 1, 82], [0, 2, 75], [1, 3, 68],
    [2, 0, 90], [3, 4, 77], [4, 5, 63],
    [5, 6, 71], [6, 7, 84], [7, 0, 79],
  ]
  for (const [from, to, rank] of crossEdges) {
    events.push({
      kind: NIP85_KINDS.USER,
      tags: [
        ['d', pubkeys[to]],
        ['p', pubkeys[from]],
        ['rank', String(rank)],
      ],
      content: '',
      created_at: now - 1800 + from * 60,
    })
  }

  // Ring-endorsed assertions — the circle's anonymous scores for the source
  events.push({
    kind: NIP85_KINDS.USER,
    tags: [
      ['d', sourcePk],
      ['p', '0000000000000000000000000000000000000000000000000000000000000000'],
      ['rank', '79'],
      ['veil-ring', ...pubkeys],
      ['veil-threshold', '8', '8'],
    ],
    content: '',
    created_at: now - 600,
  })

  // Canary heartbeat events — circle members checking in (kind 20078 ephemeral)
  for (let i = 0; i < 6; i++) {
    events.push({
      kind: 20078,
      tags: [['d', pubkeys[i]], ['p', pubkeys[i]]],
      content: '',
      created_at: now - 300 + i * 30,
    })
  }

  return events
}

interface RelayProviderProps {
  children: ReactNode
  useDemoData?: boolean
}

export function RelayProvider({ children, useDemoData = true }: RelayProviderProps) {
  const [events, setEvents] = useState<EventTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])
  const poolRef = useRef<SimplePool | null>(null)
  const demoDataLoadedRef = useRef(false)

  // Load demo data into graph (but not into the event log ticker)
  useEffect(() => {
    if (!useDemoData || demoDataLoadedRef.current) return
    demoDataLoadedRef.current = true

    const demoEvents = generateDemoEvents()
    // Load all events into the graph immediately (for the trust graph to work)
    setEvents(demoEvents)
    setLoading(false)
    // The ticker starts empty. Events appear only as the user interacts.
  }, [useDemoData])

  // Attempt relay connection (non-blocking — demo data is already loaded)
  useEffect(() => {
    const pool = new SimplePool()
    poolRef.current = pool

    let cancelled = false

    const kinds = [NIP85_KINDS.USER, NIP85_KINDS.PROVIDER]
    const sub = pool.subscribeMany(RELAYS, [{ kinds, limit: 50 }], {
      onevent(event: NostrEvent) {
        if (cancelled) return
        const template: EventTemplate = {
          kind: event.kind,
          tags: event.tags,
          content: event.content,
          created_at: event.created_at,
        }
        setEvents(prev => [...prev, template])

        const dTag = event.tags.find(t => t[0] === 'd')
        setEventLog(prev => [
          {
            kind: event.kind,
            subject: dTag?.[1] ?? '',
            anonymous: event.tags.some(t => t[0] === 'veil-ring'),
            timestamp: event.created_at,
          },
          ...prev,
        ].slice(0, 100))
      },
      oneose() {
        if (!cancelled) setLoading(false)
      },
    })

    // Timeout — if no EOSE after 5s, stop loading
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 5000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      sub.close()
      pool.close(RELAYS)
    }
  }, [])

  // Build graph whenever events change
  const graph = useMemo(() => {
    if (events.length === 0) return emptyGraph
    try {
      return buildTrustGraph(events)
    } catch (e) {
      setError(String((e as Error).message))
      return emptyGraph
    }
  }, [events])

  const addLogEntry = useCallback((entry: EventLogEntry) => {
    setEventLog(prev => [entry, ...prev].slice(0, 100))
  }, [])

  const value = useMemo(
    () => ({ graph, events, loading, error, eventLog, addLogEntry }),
    [graph, events, loading, error, eventLog, addLogEntry],
  )

  return (
    <RelayContext.Provider value={value}>
      {children}
    </RelayContext.Provider>
  )
}
