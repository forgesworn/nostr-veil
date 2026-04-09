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

// ─── kind metadata ────────────────────────────────────────────────────────────

interface KindMeta {
  label: string
  colour: string
  nip: string
  badge: string
  explain: (ev: RelayEvent) => string
}

const KIND_META: Record<number, KindMeta> = {
  31000: {
    label: 'NIP-VA Attestation',
    colour: '#4ade80',
    nip: 'NIP-VA',
    badge: 'ATTRIBUTABLE',
    explain: (ev) => {
      const rank = ev.tags.find(t => t[0] === 'rank')?.[1] ?? '?'
      const subject = ev.tags.find(t => t[0] === 'p')?.[1] ?? ''
      return `Personal credibility attestation. The journalist scored the source (${truncate(subject, 6)}…) at rank ${rank}/100. Signed on an ESP32 hardware signer via NIP-46, published under the journalist's real persona pubkey — publicly attributable. In the next step this score is hidden inside an anonymous ring signature.`
    },
  },
  30382: {
    label: 'NIP-85 Ring Assertion',
    colour: '#d97706',
    nip: 'NIP-85',
    badge: 'ANONYMOUS',
    explain: (ev) => {
      const veilSigs = ev.tags.filter(t => t[0] === 'veil-sig')
      const ring = ev.tags.find(t => t[0] === 'veil-ring')
      const ringSize = ring ? ring.length - 1 : '?'
      const rank = ev.tags.find(t => t[0] === 'rank')?.[1] ?? '?'
      return `${veilSigs.length} journalists from a ring of ${ringSize} members each contributed an anonymous score via LSAG ring signatures. The median rank is ${rank}/100. Each veil-sig tag contains a ring signature with a unique key image that prevents double-scoring. No one — not even the relay operator — can determine which journalist gave which score.`
    },
  },
  30078: {
    label: 'Identity Disclosure',
    colour: '#7b68ee',
    nip: 'NIP-78',
    badge: 'VOLUNTARY',
    explain: (ev) => {
      const masterPk = ev.tags.find(t => t[0] === 'master-pubkey')?.[1] ?? ''
      return `Voluntary proof linking the anonymous persona key to the journalist's Heartwood master key (${truncate(masterPk, 6)}…). The master signed a kind 1 event declaring ownership of the persona key — that event is embedded verbatim in the content. Anyone can verify it: parse the JSON, call schnorr.verify(sig, id, pubkey). The master-pubkey and child tags form the nsec-tree linkage.`
    },
  },
  1: {
    label: 'Ownership Attestation',
    colour: '#94a3b8',
    nip: 'NIP-01',
    badge: 'NESTED',
    explain: () => `Signed by the Heartwood master key. Contains a child tag pointing to the persona pubkey, and content in the form nsec-tree:own|master|persona, proving both keys share the same Heartwood root. Embedded verbatim inside the kind 30078 disclosure event.`,
  },
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function truncate(hex: string, n = 8): string {
  if (hex.length <= n * 2 + 3) return hex
  return hex.slice(0, n) + '...' + hex.slice(-6)
}

function toNpub(hex: string): string {
  try { return nip19.npubEncode(hex) } catch { return hex }
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

// ─── sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value, colour, mono = true }: {
  label: string; value: string; colour?: string; mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid #0f0f1a' }}>
      <span style={{ color: '#4b5563', minWidth: 90, flexShrink: 0, fontSize: '0.75rem', paddingTop: 1 }}>{label}</span>
      <span style={{
        color: colour ?? '#9ca3af',
        wordBreak: 'break-all',
        flex: 1,
        fontSize: '0.78rem',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>{value}</span>
    </div>
  )
}

function SigChip({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false)
  let parsed: Record<string, unknown> | null = null
  try { parsed = JSON.parse(value) } catch { /* raw string */ }
  const keyImage = parsed && typeof parsed === 'object' && 'ki' in parsed
    ? String(parsed.ki).slice(0, 16) + '…'
    : truncate(value, 8)

  return (
    <div style={{ marginBottom: '0.3rem' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          cursor: 'pointer', fontSize: '0.75rem', color: '#d97706',
          padding: '0.2rem 0',
        }}
      >
        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{open ? '▾' : '▸'}</span>
        <span style={{ color: '#6b7280' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>ki: {keyImage}</span>
      </div>
      {open && (
        <pre style={{
          fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', background: '#08080d',
          padding: '0.4rem 0.6rem', border: '1px solid #1a1a2e',
          marginTop: '0.2rem', marginLeft: '0.8rem',
          maxHeight: 120, overflowY: 'auto',
        }}>
          {parsed ? JSON.stringify(parsed, null, 2) : value}
        </pre>
      )}
    </div>
  )
}

function TagsTable({ tags }: { tags: string[][] }) {
  const skip = new Set(['veil-sig', 'veil-ring'])
  const rows = tags.filter(t => !skip.has(t[0]))

  if (rows.length === 0) return null
  return (
    <div style={{ marginTop: '0.8rem' }}>
      <SectionLabel>TAGS</SectionLabel>
      <div style={{ border: '1px solid #1a1a2e', overflow: 'hidden' }}>
        {rows.map((t, i) => (
          <div key={i} style={{
            display: 'flex', gap: 0,
            borderBottom: i < rows.length - 1 ? '1px solid #0f0f1a' : 'none',
          }}>
            <span style={{
              background: '#0d0d14', padding: '0.25rem 0.5rem',
              fontSize: '0.72rem', color: '#7b68ee', fontFamily: 'monospace',
              minWidth: 90, flexShrink: 0, borderRight: '1px solid #1a1a2e',
            }}>{t[0]}</span>
            <span style={{
              padding: '0.25rem 0.5rem', fontSize: '0.72rem',
              color: '#9ca3af', fontFamily: 'monospace',
              wordBreak: 'break-all', flex: 1,
            }}>{t.slice(1).join('  ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RawJson({ ev }: { ev: RelayEvent }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '0.8rem' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          cursor: 'pointer', fontSize: '0.72rem', color: '#4b5563',
          letterSpacing: '0.08em', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '0.65rem' }}>{open ? '▾' : '▸'}</span>
        RAW JSON
      </div>
      {open && (
        <pre style={{
          fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', background: '#08080d',
          padding: '0.6rem', border: '1px solid #1a1a2e',
          marginTop: '0.4rem', maxHeight: 300, overflowY: 'auto',
        }}>
          {JSON.stringify(ev, null, 2)}
        </pre>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.68rem', color: '#4b5563', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
      {children}
    </div>
  )
}

function EventHeader({ ev, meta, nested = false }: { ev: RelayEvent; meta: KindMeta; nested?: boolean }) {
  const npub = toNpub(ev.pubkey)
  return (
    <div style={{ marginBottom: nested ? '0.8rem' : '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span style={{
          fontSize: '0.68rem', padding: '0.15rem 0.45rem',
          background: `${meta.colour}15`, border: `1px solid ${meta.colour}40`,
          color: meta.colour, letterSpacing: '0.05em',
        }}>
          kind {ev.kind}
        </span>
        <span style={{ fontSize: nested ? '0.9rem' : '1rem', color: '#e0e0e0', fontWeight: 600 }}>
          {meta.label}
        </span>
        <span style={{
          fontSize: '0.62rem', padding: '0.1rem 0.35rem',
          border: `1px solid ${meta.colour}30`, color: `${meta.colour}99`,
          letterSpacing: '0.08em',
        }}>
          {meta.badge}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <DetailRow label="event id" value={truncate(ev.id, 12)} colour="#9ca3af" />
        <DetailRow label="npub" value={npub} colour="#7b68ee" />
        <DetailRow label="pubkey" value={truncate(ev.pubkey, 12)} />
        <DetailRow label="signed" value={`${formatTime(ev.created_at)}  ·  ${timeAgo(ev.created_at)}`} mono={false} />
        <DetailRow label="sig" value={truncate(ev.sig, 14)} />
      </div>
    </div>
  )
}

function NestedKind1({ content }: { content: string }) {
  let ev: RelayEvent | null = null
  try { ev = JSON.parse(content) } catch { return null }
  if (!ev || ev.kind !== 1) return null

  const meta = KIND_META[1]
  const parts = ev.content.split('|')
  const masterHex = parts[1] ?? ''
  const personaHex = parts[2] ?? ''

  return (
    <div style={{ marginTop: '1.2rem' }}>
      <SectionLabel>EMBEDDED KIND 1 — MASTER OWNERSHIP PROOF</SectionLabel>
      <div style={{
        padding: '0.8rem',
        background: '#08080d',
        border: `1px solid ${meta.colour}30`,
        borderLeft: `3px solid ${meta.colour}`,
      }}>
        <EventHeader ev={ev} meta={meta} nested />

        <div style={{ marginTop: '0.6rem' }}>
          <SectionLabel>nsec-tree OWNERSHIP CLAIM</SectionLabel>
          <div style={{
            padding: '0.5rem 0.7rem',
            background: '#0d0d14',
            border: '1px solid #1a1a2e',
            fontSize: '0.75rem',
            display: 'flex', flexDirection: 'column', gap: '0.3rem',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: '#4b5563', width: 60, flexShrink: 0 }}>master</span>
              <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{truncate(masterHex, 10)}</span>
              <span style={{ color: '#4b5563', fontSize: '0.65rem' }}>{toNpub(masterHex).slice(0, 20)}…</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: '#4b5563', width: 60, flexShrink: 0, paddingLeft: 8 }}>↳ owns</span>
              <span style={{ color: '#7b68ee', fontFamily: 'monospace' }}>{truncate(personaHex, 10)}</span>
              <span style={{ color: '#4b5563', fontSize: '0.65rem' }}>{toNpub(personaHex).slice(0, 20)}…</span>
            </div>
          </div>
        </div>

        <TagsTable tags={ev.tags} />

        <div style={{ marginTop: '0.8rem' }}>
          <SectionLabel>HOW TO VERIFY</SectionLabel>
          <div style={{
            padding: '0.5rem 0.7rem', background: '#0d0d14',
            border: '1px solid #1a1a2e', fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.6,
          }}>
            <code style={{ color: '#9ca3af' }}>
              schnorr.verify(event.sig, hexToBytes(event.id), hexToBytes(event.pubkey))
            </code>
            <br />
            Then confirm <code style={{ color: '#7b68ee' }}>event.pubkey === master-pubkey tag</code> on the outer 30078.
          </div>
        </div>

        <RawJson ev={ev} />
      </div>
    </div>
  )
}

// ─── identity strip ───────────────────────────────────────────────────────────

function IdentityStrip({ events }: { events: RelayEvent[] }) {
  const disclosure = events.find(e => e.kind === 30078)
  const personaHex = disclosure?.pubkey ?? events.find(e => e.kind === 31000)?.pubkey ?? ''
  const masterHex = disclosure?.tags.find(t => t[0] === 'master-pubkey')?.[1] ?? ''

  if (!personaHex && !masterHex) return null

  return (
    <div style={{
      display: 'flex', gap: '1rem', flexWrap: 'wrap',
      padding: '0.7rem 1rem',
      background: '#0a0a12',
      border: '1px solid #1a1a2e',
      marginBottom: '1.2rem',
    }}>
      <div style={{ fontSize: '0.68rem', color: '#4b5563', letterSpacing: '0.1em', alignSelf: 'center', marginRight: '0.2rem' }}>
        HEARTWOOD KEYS
      </div>
      {masterHex && (
        <KeyPill label="master" hex={masterHex} colour="#94a3b8" />
      )}
      {personaHex && (
        <KeyPill label="veil-demo-journalist" hex={personaHex} colour="#7b68ee" />
      )}
    </div>
  )
}

function KeyPill({ label, hex, colour }: { label: string; hex: string; colour: string }) {
  const npub = toNpub(hex)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      <span style={{
        fontSize: '0.65rem', padding: '0.1rem 0.35rem',
        background: `${colour}10`, border: `1px solid ${colour}30`,
        color: colour, letterSpacing: '0.06em',
      }}>{label}</span>
      <span style={{ fontSize: '0.72rem', color: '#6b7280', fontFamily: 'monospace' }}>
        {npub.slice(0, 20)}…{npub.slice(-6)}
      </span>
      <span style={{ fontSize: '0.68rem', color: '#374151', fontFamily: 'monospace' }}>
        ({truncate(hex, 6)})
      </span>
    </div>
  )
}

// ─── detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ ev, onClose }: { ev: RelayEvent; onClose: () => void }) {
  const meta = KIND_META[ev.kind]
  if (!meta) return null

  const rankTag = ev.tags.find(t => t[0] === 'rank')
  const veilRing = ev.tags.find(t => t[0] === 'veil-ring')
  const veilSigs = ev.tags.filter(t => t[0] === 'veil-sig')

  return (
    <div style={{
      flex: 1, minWidth: 300, maxWidth: 520,
      padding: '1.2rem',
      background: '#0a0a12',
      border: `1px solid ${meta.colour}40`,
      borderTop: `3px solid ${meta.colour}`,
      alignSelf: 'flex-start',
      position: 'sticky',
      top: '1rem',
      maxHeight: 'calc(100vh - 4rem)',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.68rem', color: meta.colour, letterSpacing: '0.1em' }}>{meta.nip}</div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid #374151', color: '#6b7280',
            padding: '0.15rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem',
          }}
        >
          close
        </button>
      </div>

      <EventHeader ev={ev} meta={meta} />

      {/* Plain-English explanation */}
      <div style={{
        padding: '0.7rem 0.8rem',
        background: `${meta.colour}08`,
        borderLeft: `2px solid ${meta.colour}50`,
        marginBottom: '1rem',
        fontSize: '0.82rem',
        color: '#b0b0b0',
        lineHeight: 1.65,
      }}>
        {meta.explain(ev)}
      </div>

      {rankTag && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.3rem 0.7rem',
          background: '#4ade8010',
          border: '1px solid #4ade8040',
          marginBottom: '0.8rem',
        }}>
          <span style={{ fontSize: '0.7rem', color: '#6b7280', letterSpacing: '0.08em' }}>RANK</span>
          <span style={{ fontSize: '1.3rem', color: '#4ade80', fontWeight: 700, lineHeight: 1 }}>{rankTag[1]}</span>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>/ 100</span>
        </div>
      )}

      <TagsTable tags={ev.tags} />

      {/* Ring members */}
      {veilRing && (
        <div style={{ marginTop: '0.8rem' }}>
          <SectionLabel>RING MEMBERS ({veilRing.length - 1})</SectionLabel>
          <div style={{ border: '1px solid #1a1a2e', overflow: 'hidden' }}>
            {veilRing.slice(1).map((pk, i) => (
              <div key={i} style={{
                display: 'flex', gap: '0.5rem', alignItems: 'center',
                padding: '0.25rem 0.5rem',
                borderBottom: i < veilRing.length - 2 ? '1px solid #0f0f1a' : 'none',
              }}>
                <span style={{ fontSize: '0.68rem', color: '#374151', width: 16, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: '0.72rem', color: '#6b7280', fontFamily: 'monospace' }}>
                  {truncate(pk, 10)}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#374151', fontFamily: 'monospace' }}>
                  {toNpub(pk).slice(0, 16)}…
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ring signatures */}
      {veilSigs.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <SectionLabel>RING SIGNATURES ({veilSigs.length})</SectionLabel>
          {veilSigs.map((sig, i) => (
            <SigChip key={i} label={`sig ${i + 1}`} value={sig[1] ?? ''} />
          ))}
        </div>
      )}

      {/* Embedded kind 1 for 30078 */}
      {ev.kind === 30078 && ev.content && (
        <NestedKind1 content={ev.content} />
      )}

      {/* Content for non-30078, non-NIP-46 events */}
      {ev.content && ev.kind !== 30078 && ev.kind !== 24133 && (
        <div style={{ marginTop: '0.8rem' }}>
          <SectionLabel>CONTENT</SectionLabel>
          <pre style={{
            fontSize: '0.72rem', color: '#6b7280', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', background: '#08080d',
            padding: '0.5rem', border: '1px solid #1a1a2e',
            maxHeight: 120, overflowY: 'auto',
          }}>
            {ev.content.length > 400 ? ev.content.slice(0, 400) + '…' : ev.content}
          </pre>
        </div>
      )}

      <RawJson ev={ev} />
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

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
      setStatus('Fetching recent events…')
      ws.send(JSON.stringify(['REQ', 'recap', {
        kinds: [31000, 30382, 30078],
        limit: 50,
        since: Math.floor(Date.now() / 1000) - 600,
      }]))
    }

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string)
        if (data[0] === 'EVENT' && data[2]) {
          const ev = data[2] as RelayEvent
          if (KIND_META[ev.kind]) {
            collected.push(ev)
            collected.sort((a, b) => a.created_at - b.created_at)
            setEvents([...collected])
          }
        } else if (data[0] === 'EOSE') {
          setStatus(collected.length > 0
            ? `${collected.length} events · ${RELAY}`
            : 'No recent events. Complete the demo flow first.')
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => setStatus('Failed to connect to relay')
    ws.onclose = () => {}
    return () => { ws.close() }
  }, [])

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>What just happened, on-chain.</strong>{' '}
        Real Nostr events fetched live from <span style={{ color: '#7b68ee' }}>{RELAY}</span>, each signed by the Heartwood ESP32.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Click any event to inspect its structure, tags, ring signatures, and embedded proofs.
      </p>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        marginBottom: '1rem',
        padding: '0.5rem 0.8rem',
        background: '#0d0d14',
        border: '1px solid #1a1a2e',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: events.length > 0 ? '#4ade80' : '#facc15',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{status}</span>
      </div>

      {/* Identity strip — appears once we have events */}
      <IdentityStrip events={events} />

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Event list */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
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
                  padding: '0.65rem 0.9rem',
                  background: isSelected ? `${meta.colour}0c` : '#08080f',
                  border: isSelected ? `1px solid ${meta.colour}50` : '1px solid #151520',
                  borderLeft: `3px solid ${meta.colour}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.65rem', padding: '0.1rem 0.35rem',
                      background: `${meta.colour}15`, border: `1px solid ${meta.colour}40`,
                      color: meta.colour, letterSpacing: '0.05em',
                    }}>
                      {ev.kind}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#d0d0d0', fontWeight: 500 }}>
                      {meta.label}
                    </span>
                    {rankTag && (
                      <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>
                        rank {rankTag[1]}
                      </span>
                    )}
                    {veilSigs.length > 0 && (
                      <span style={{ fontSize: '0.72rem', color: '#d97706' }}>
                        {veilSigs.length} ring sigs
                      </span>
                    )}
                    <span style={{
                      fontSize: '0.6rem', padding: '0.05rem 0.3rem',
                      border: `1px solid ${meta.colour}25`, color: `${meta.colour}80`,
                      letterSpacing: '0.07em',
                    }}>
                      {meta.badge}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: '#374151', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {formatTime(ev.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#374151', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                  {truncate(ev.id, 14)}
                </div>
              </div>
            )
          })}

          {events.length === 0 && status.includes('No recent') && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
              No events found. Complete the demo flow with Bark connected.
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <DetailPanel ev={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}
