import { useState, useEffect, useRef } from 'react'
import { nip19 } from 'nostr-tools'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

const RELAY = 'wss://relay.trotters.cc'

interface RelayEvent {
  id: string
  pubkey: string
  kind: number
  created_at: number
  tags: string[][]
  content: string
  sig: string
}

interface KindMeta {
  label: string
  colour: string
  nip: string
  summary: string
  explain: (ev: RelayEvent) => string
}

const KIND_META: Record<number, KindMeta> = {
  31000: {
    label: 'NIP-VA Attestation',
    colour: '#4ade80',
    nip: 'NIP-VA (nostr-attestations)',
    summary: 'Individual credibility score signed by your hardware key via Bark.',
    explain: (ev) => {
      const rank = ev.tags.find(t => t[0] === 'rank')?.[1] ?? '?'
      const subject = ev.tags.find(t => t[0] === 'p')?.[1] ?? ''
      return `This is a personal credibility attestation. The journalist scored the source (${subject.slice(0, 12)}...) at rank ${rank}/100. It was signed on an ESP32 hardware signer via NIP-46 and published to the relay. This event is publicly attributable to the signer's npub. In the next step, this score is hidden inside an anonymous ring signature so no one can tell who gave which score.`
    },
  },
  30382: {
    label: 'Ring-endorsed Assertion (NIP-85)',
    colour: '#d97706',
    nip: 'NIP-85',
    summary: 'Anonymous LSAG ring signatures aggregated into a single trust assertion.',
    explain: (ev) => {
      const veilSigs = ev.tags.filter(t => t[0] === 'veil-sig')
      const ring = ev.tags.find(t => t[0] === 'veil-ring')
      const ringSize = ring ? ring.length - 1 : '?'
      const rank = ev.tags.find(t => t[0] === 'rank')?.[1] ?? '?'
      return `This is the core NIP-85 event. ${veilSigs.length} journalists from a ring of ${ringSize} members each contributed an anonymous score via LSAG ring signatures. The median rank is ${rank}/100. Each veil-sig tag contains a ring signature with a unique key image that prevents double-scoring. No one, not even the relay operator, can determine which journalist gave which score. The veil-ring tag lists all circle members' public keys. Any Nostr client implementing NIP-85 can verify the ring signatures and display the aggregated trust score.`
    },
  },
  30078: {
    label: 'Identity Disclosure',
    colour: '#7b68ee',
    nip: 'NIP-78 (app-specific data)',
    summary: 'Voluntary proof linking anonymous and public identities via nsec-tree.',
    explain: (ev) => {
      const masterPk = ev.tags.find(t => t[0] === 'master-pubkey')?.[1] ?? ''
      return `The journalist signed a kind 1 attestation event with their Heartwood master key, proving they control the persona key in the persona-pubkey tag. That event is embedded verbatim in this event's content. Anyone can verify: parse the content JSON, then call schnorr.verify(attestation.sig, hexToBytes(attestation.id), hexToBytes(attestation.pubkey)). The master-pubkey tag (${masterPk.slice(0, 12)}...) matches the nested event's author; its child tag matches this event's author — proving both keys share the same Heartwood root.`
    },
  },
  24133: {
    label: 'NIP-46 Envelope',
    colour: '#6b7280',
    nip: 'NIP-46',
    summary: 'Encrypted NIP-46 remote signing envelope.',
    explain: () => 'NIP-46 transport envelope. Contains an encrypted request or response between the signing client (Bark) and the hardware signer (Heartwood ESP32) via relay.',
  },
}

function truncate(hex: string, n = 8): string {
  if (hex.length <= n * 2 + 3) return hex
  return hex.slice(0, n) + '...' + hex.slice(-6)
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function Network({ flow: _flow }: Props) {
  const [events, setEvents] = useState<RelayEvent[]>([])
  const [status, setStatus] = useState('Connecting to relay...')
  const [selected, setSelected] = useState<RelayEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(RELAY)
    wsRef.current = ws
    const collected: RelayEvent[] = []

    ws.onopen = () => {
      setStatus('Fetching recent events...')
      const filter = {
        kinds: [31000, 30382, 30078, 24133],
        limit: 50,
        since: Math.floor(Date.now() / 1000) - 300,
      }
      ws.send(JSON.stringify(['REQ', 'recap', filter]))
    }

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)
        if (data[0] === 'EVENT' && data[2]) {
          const ev = data[2] as RelayEvent
          if (KIND_META[ev.kind]) {
            collected.push(ev)
            collected.sort((a, b) => a.created_at - b.created_at)
            setEvents([...collected])
          }
        } else if (data[0] === 'EOSE') {
          setStatus(collected.length > 0
            ? `${collected.length} events from ${RELAY}`
            : 'No recent events found. Run the demo flow first.')
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => setStatus('Failed to connect to relay')
    ws.onclose = () => {}
    return () => { ws.close() }
  }, [])

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>What just happened, on-chain.</strong> Real Nostr events
        fetched live from <span style={{ color: '#7b68ee' }}>{RELAY}</span>. Each was signed by
        a Heartwood ESP32 hardware signer and published during this demo.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Click any event to see what it means in plain English. The NIP-85 ring-endorsed event
        is the centrepiece: anonymous trust scores from a journalist circle, verifiable by any
        Nostr client.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        marginBottom: '1rem',
        padding: '0.6rem 0.8rem',
        background: '#0d0d14',
        border: '1px solid #1a1a2e',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: events.length > 0 ? '#4ade80' : '#facc15',
        }} />
        <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{status}</span>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Event list */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {events.map(ev => {
            const meta = KIND_META[ev.kind]
            if (!meta) return null
            const isSelected = selected?.id === ev.id
            const rankTag = ev.tags.find(t => t[0] === 'rank')
            const veilSigs = ev.tags.filter(t => t[0] === 'veil-sig')

            return (
              <div
                key={ev.id}
                onClick={() => setSelected(isSelected ? null : ev)}
                style={{
                  padding: '0.7rem 1rem',
                  background: isSelected ? `${meta.colour}10` : '#0a0a12',
                  border: isSelected ? `1px solid ${meta.colour}60` : '1px solid #1a1a2e',
                  borderLeft: `3px solid ${meta.colour}`,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.1rem 0.4rem',
                      background: `${meta.colour}15`,
                      border: `1px solid ${meta.colour}40`,
                      color: meta.colour,
                      letterSpacing: '0.05em',
                    }}>
                      {ev.kind}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#e0e0e0', fontWeight: 500 }}>
                      {meta.label}
                    </span>
                    {rankTag && (
                      <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>
                        rank {rankTag[1]}
                      </span>
                    )}
                    {veilSigs.length > 0 && (
                      <span style={{ fontSize: '0.8rem', color: '#d97706' }}>
                        {veilSigs.length} sigs
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                    {formatTime(ev.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>
                  {truncate(ev.id, 12)}
                </div>
              </div>
            )
          })}

          {events.length === 0 && status.includes('No recent') && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
              No events found. Complete the demo flow with Bark connected to see events here.
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (() => {
          const meta = KIND_META[selected.kind]
          if (!meta) return null
          const rankTag = selected.tags.find(t => t[0] === 'rank')
          const veilRing = selected.tags.find(t => t[0] === 'veil-ring')
          const veilSigs = selected.tags.filter(t => t[0] === 'veil-sig')
          const pTags = selected.tags.filter(t => t[0] === 'p')

          return (
            <div style={{
              flex: 1, minWidth: 300, maxWidth: 500,
              padding: '1.2rem',
              background: '#0a0a12',
              border: `1px solid ${meta.colour}40`,
              borderTop: `3px solid ${meta.colour}`,
              alignSelf: 'flex-start',
              position: 'sticky',
              top: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: meta.colour, letterSpacing: '0.1em', marginBottom: '0.2rem' }}>
                    {meta.nip}
                  </div>
                  <div style={{ fontSize: '1.1rem', color: '#e0e0e0', fontWeight: 600 }}>
                    {meta.label}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: 'none', border: '1px solid #374151', color: '#9ca3af',
                    padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem',
                  }}
                >
                  close
                </button>
              </div>

              {/* Human-friendly explanation */}
              <div style={{
                padding: '0.8rem',
                background: `${meta.colour}08`,
                borderLeft: `2px solid ${meta.colour}`,
                marginBottom: '1rem',
                fontSize: '0.85rem',
                color: '#c0c0c0',
                lineHeight: 1.6,
              }}>
                {meta.explain(selected)}
              </div>

              {/* Event metadata */}
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <DetailRow label="Event ID" value={selected.id} colour={meta.colour} />
                <DetailRow label="Author" value={selected.pubkey} />
                <DetailRow label="npub" value={nip19.npubEncode(selected.pubkey)} colour="#7b68ee" />
                <DetailRow label="Created" value={`${formatTime(selected.created_at)} (${timeAgo(selected.created_at)})`} />
                <DetailRow label="Kind" value={`${selected.kind} (${meta.nip})`} colour={meta.colour} />
                <DetailRow label="Signature" value={truncate(selected.sig, 16)} />

                {rankTag && <DetailRow label="Rank" value={`${rankTag[1]} / 100`} colour="#4ade80" />}

                {veilRing && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ color: '#d97706', fontSize: '0.75rem', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                      RING MEMBERS ({veilRing.length - 1})
                    </div>
                    {veilRing.slice(1).map((pk, i) => (
                      <div key={i} style={{ fontSize: '0.75rem', color: '#6b7280', padding: '0.1rem 0' }}>
                        {i + 1}. {truncate(pk, 10)}
                      </div>
                    ))}
                  </div>
                )}

                {veilSigs.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ color: '#d97706', fontSize: '0.75rem', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                      RING SIGNATURES ({veilSigs.length})
                    </div>
                    {veilSigs.map((sig, i) => (
                      <div key={i} style={{ fontSize: '0.75rem', color: '#6b7280', padding: '0.1rem 0' }}>
                        sig {i + 1}: {truncate(sig[1] ?? '', 16)}
                      </div>
                    ))}
                  </div>
                )}

                {pTags.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                      REFERENCED PUBKEYS
                    </div>
                    {pTags.map((t, i) => (
                      <div key={i} style={{ fontSize: '0.75rem', color: '#6b7280', padding: '0.1rem 0' }}>
                        {truncate(t[1] ?? '', 10)}
                      </div>
                    ))}
                  </div>
                )}

                {selected.content && selected.kind !== 24133 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                      CONTENT
                    </div>
                    <pre style={{
                      fontSize: '0.75rem', color: '#6b7280',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      maxHeight: 150, overflowY: 'auto',
                      background: '#08080d', padding: '0.5rem',
                      border: '1px solid #1a1a2e',
                    }}>
                      {selected.content.length > 500 ? selected.content.slice(0, 500) + '...' : selected.content}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function DetailRow({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.8rem', padding: '0.2rem 0', borderBottom: '1px solid #1a1a2e' }}>
      <span style={{ color: '#6b7280', minWidth: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: colour ?? '#b0b0b0', wordBreak: 'break-all', flex: 1 }}>{value}</span>
    </div>
  )
}
