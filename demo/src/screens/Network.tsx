import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { TrustGraphView, type GraphNode, type GraphEdge, type RingEvent } from '../components/TrustGraphView.js'
import { NodePanel } from '../components/NodePanel.js'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
import type { TrustNode } from 'nostr-veil/graph'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

export function Network({ flow: _flow }: Props) {
  const { graph, loading, addLogEntry } = useRelay()
  const [selectedNode, setSelectedNode] = useState<TrustNode | null>(null)
  const [ringEvent, setRingEvent] = useState<RingEvent | null>(null)
  const [duressNode, setDuressNode] = useState<{ pubkey: string; id: number } | null>(null)
  const duressCounter = useRef(0)
  const [statusMsg, setStatusMsg] = useState<{ text: string; colour: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 900, h: 600 })

  // Fill the available space — measure the container
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // Available height = viewport bottom minus the container top minus ticker (44px) minus margin
      const availH = Math.floor(window.innerHeight - rect.top - 52)
      setDims({ w: Math.floor(rect.width), h: Math.max(400, availH) })
    }
    measure()
    const obs = new ResizeObserver(measure)
    if (containerRef.current) obs.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => { obs.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const graphNodes: GraphNode[] = useMemo(() => {
    const result: GraphNode[] = []
    for (const [pubkey, node] of graph.nodes) {
      result.push({
        pubkey,
        endorsements: node.endorsements,
        ringEndorsements: node.ringEndorsements,
      })
    }
    return result
  }, [graph])

  const graphEdges: GraphEdge[] = useMemo(() => {
    return graph.edges.map(e => ({
      from: e.from,
      to: e.to,
      anonymous: e.anonymous,
    }))
  }, [graph])

  const pubkeys = useMemo(() => graphNodes.map(n => n.pubkey), [graphNodes])

  const handleNodeClick = (pubkey: string) => {
    const node = graph.nodes.get(pubkey) ?? null
    setSelectedNode(prev => prev?.pubkey === pubkey ? null : node)
  }

  const handleRingEndorse = useCallback(() => {
    if (pubkeys.length < 3) return
    const shuffled = [...pubkeys].sort(() => Math.random() - 0.5)
    const committeeSize = Math.min(3 + Math.floor(Math.random() * 3), shuffled.length - 1)
    const members = shuffled.slice(0, committeeSize)
    const subject = shuffled[committeeSize]
    setRingEvent({ members, subject })
    addLogEntry({
      kind: 30382,
      subject,
      anonymous: true,
      timestamp: Math.floor(Date.now() / 1000),
      description: `Ring endorsement: ${committeeSize} circle members anonymously scored ${subject.slice(0, 8)}... via LSAG. Published as NIP-85 kind 30382 with veil-ring and veil-sig tags.`,
    })
    setStatusMsg({
      text: `Ring endorsement: ${committeeSize} circle members anonymously scored ${subject.slice(0, 8)}... The golden arc shows the LSAG signature flowing through the ring to produce a single NIP-85 trust assertion. No one can tell which member gave which score.`,
      colour: '#d97706',
    })
    setTimeout(() => setStatusMsg(null), 10000)
  }, [pubkeys, addLogEntry])

  const handleDuress = useCallback(() => {
    if (pubkeys.length === 0) return
    const idx = Math.floor(Math.random() * pubkeys.length)
    const pk = pubkeys[idx]
    duressCounter.current++
    setDuressNode({ pubkey: pk, id: duressCounter.current })
    addLogEntry({
      kind: 20078,
      subject: pk,
      anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `Duress alert: ${pk.slice(0, 8)}... missed heartbeat (canary-kit kind 20078). Network isolates the node; edges severed, adjacent members warned. Not NIP-85. This is the coercion protection layer.`,
    })
    setStatusMsg({
      text: `Duress detected: ${pk.slice(0, 8)}... stopped sending heartbeats. The network isolates the compromised node (red ripple); their edges go dashed, adjacent nodes dim. This prevents a coerced member from being forced to manipulate trust scores.`,
      colour: '#dc2626',
    })
    setTimeout(() => setStatusMsg(null), 10000)
  }, [pubkeys, addLogEntry])

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.05rem', marginBottom: '0.5rem', lineHeight: 1.6, margin: '0 0 0.5rem 0' }}>
        <strong style={{ color: '#e0e0e0' }}>The full picture.</strong> Every <Tip term="NIP-85" /> assertion,
        ring endorsement, and <Tip term="duress">canary heartbeat</Tip>, visualised as a live trust graph.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '0.8rem', lineHeight: 1.5 }}>
        <strong style={{ color: '#d97706' }}>Ring Endorse</strong> creates anonymous NIP-85 scores
        via LSAG. <strong style={{ color: '#dc2626' }}>Duress</strong> simulates a compromised member. canary-kit
        detects the missing heartbeat and isolates the node, preventing coerced scores from corrupting
        the trust graph. Ring signatures alone aren't enough; you need liveness too.
      </p>

      {/* Legend + actions */}
      <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {/* Legend */}
        <div style={{
          flex: 1, minWidth: 200,
          padding: '0.6rem 0.8rem',
          background: '#0d0d14', border: '1px solid #1a1a2e',
          display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap',
          fontSize: '0.85rem',
        }}>
          <span style={{ color: '#9ca3af' }}>Click a node to inspect</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '2px solid #0d9488' }} />
            <span style={{ color: '#b0b0b0' }}>endorsed</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '2px solid #d97706', boxShadow: '0 0 4px #d97706' }} />
            <span style={{ color: '#b0b0b0' }}>ring-endorsed</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: 20, height: 2, background: '#2d5a5a' }} />
            <span style={{ color: '#b0b0b0' }}>assertion</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: 20, height: 2, background: '#d97706' }} />
            <span style={{ color: '#b0b0b0' }}>anonymous</span>
          </span>
        </div>

        {/* Ring Endorse action */}
        <button
          onClick={handleRingEndorse}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(217, 119, 6, 0.08)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            color: '#d97706',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.8rem', fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
            maxWidth: 220,
          }}
        >
          <div>RING ENDORSE</div>
          <div style={{ fontSize: '0.7rem', color: '#b0b0b0', fontWeight: 400, fontFamily: 'inherit', marginTop: 2 }}>
            Circle anonymously scores a member's <Tip term="NIP-85">NIP-85</Tip> trust
          </div>
        </button>

        {/* Duress action */}
        <button
          onClick={handleDuress}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            color: '#dc2626',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.8rem', fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
            maxWidth: 220,
          }}
        >
          <div>DURESS</div>
          <div style={{ fontSize: '0.7rem', color: '#b0b0b0', fontWeight: 400, fontFamily: 'inherit', marginTop: 2 }}>
            Member compromised. Heartbeat stops, node isolated
          </div>
        </button>
      </div>

      {/* Status message — explains what just happened */}
      {statusMsg && (
        <div style={{
          padding: '0.5rem 0.8rem',
          marginBottom: '0.5rem',
          background: `${statusMsg.colour}08`,
          borderLeft: `3px solid ${statusMsg.colour}`,
          fontSize: '0.85rem',
          color: '#c0c0c0',
          lineHeight: 1.5,
        }}>
          {statusMsg.text}
        </div>
      )}

      {loading && (
        <div style={{ fontSize: '1rem', color: '#b0b0b0', marginBottom: '0.5rem' }}>
          Loading trust graph...
        </div>
      )}

      {/* Graph fills all remaining viewport space */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        <TrustGraphView
          nodes={graphNodes}
          edges={graphEdges}
          onNodeClick={handleNodeClick}
          width={dims.w}
          height={dims.h}
          ringEvent={ringEvent}
          duressNode={duressNode}
        />
        <NodePanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      </div>
    </div>
  )
}
