import { useState, useRef, useEffect, useCallback } from 'react'
import { useRelay, type EventLogEntry } from './RelayProvider.js'

function truncate(hex: string): string {
  if (hex.length < 16) return hex
  return hex.slice(0, 8) + '...' + hex.slice(-4)
}

function kindLabel(entry: EventLogEntry): string {
  switch (entry.kind) {
    case 30382: return entry.anonymous ? 'NIP-85 ring assertion' : 'NIP-85 user assertion'
    case 30383: return 'NIP-85 event assertion'
    case 30384: return 'NIP-85 addr assertion'
    case 30385: return 'NIP-85 identifier assertion'
    case 10040: return 'NIP-85 provider declaration'
    case 20078: return entry.description?.includes('Duress') ? 'CANARY duress alert' : 'CANARY heartbeat'
    case 31000: return 'NIP-VA attestation'
    case 30078: return 'nostr-veil disclosure'
    default: return `kind ${entry.kind}`
  }
}

function isAlertDuress(entry: EventLogEntry): boolean {
  return entry.kind === 20078 && (entry.description?.includes('Duress') ?? false)
}

function entryColour(entry: EventLogEntry): string {
  if (isAlertDuress(entry)) return '#dc2626'
  if (entry.kind === 20078) return '#22c55e'
  if (entry.kind === 31000) return '#7b68ee'
  if (entry.kind === 30078) return '#38bdf8'
  if (entry.anonymous) return '#d97706'
  return '#9ca3af'
}

function badge(entry: EventLogEntry): string | null {
  if (isAlertDuress(entry)) return 'DURESS'
  if (entry.kind === 20078) return 'HEARTBEAT'
  if (entry.kind === 31000) return 'ATTESTATION'
  if (entry.kind === 30078) return 'DISCLOSURE'
  if (entry.anonymous) return 'RING'
  return null
}

function defaultDescription(entry: EventLogEntry): string {
  if (isAlertDuress(entry)) {
    return `CANARY protocol (canary-kit). Duress alert for ${truncate(entry.subject)}. Heartbeat missed, node isolated. Ephemeral kind 20078.`
  }
  if (entry.kind === 20078) {
    return `CANARY protocol (canary-kit). Heartbeat from ${truncate(entry.subject)}. This circle member is alive and well. Ephemeral kind 20078, published periodically. If heartbeats stop, a duress alert fires.`
  }
  if (entry.kind === 31000) {
    return `NIP-VA (nostr-attestations). Kind 31000 verifiable attestation for ${truncate(entry.subject)}. Used by the proof layer to anchor LSAG contributions to Nostr events.`
  }
  if (entry.kind === 30078) {
    return `nostr-veil disclosure. Kind 30078 addressable event proving two identities share a master key (nsec-tree common ownership proof). Voluntary identity reveal.`
  }
  if (entry.anonymous) {
    return `NIP-85 anonymous ring assertion for ${truncate(entry.subject)}. Ring-signed by a trust circle via LSAG (nostr-veil proof layer). Kind ${entry.kind} with veil-ring/veil-sig tags.`
  }
  return `NIP-85 standard ${entry.kind === 10040 ? 'provider declaration' : 'user assertion'} for ${truncate(entry.subject)}. Kind ${entry.kind} trust metrics published to Nostr relays.`
}

const SCROLL_STEP = 300

export function EventTicker() {
  const { eventLog } = useRelay()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)
  const pausedRef = useRef(false)

  // Auto-scroll to start when new events arrive
  useEffect(() => {
    if (eventLog.length > prevLenRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = 0
    }
    prevLenRef.current = eventLog.length
  }, [eventLog.length])

  // Gentle auto-scroll: 0.5px per frame, pauses on hover
  useEffect(() => {
    let raf: number
    const tick = () => {
      const el = scrollRef.current
      if (el && !pausedRef.current) {
        el.scrollLeft += 0.5
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const scrollLeft = useCallback(() => {
    scrollRef.current?.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' })
  }, [])

  const scrollRight = useCallback(() => {
    scrollRef.current?.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' })
  }, [])

  const items = eventLog.slice(0, 60)
  const detailIdx = selectedIdx ?? hoveredIdx
  const detailEntry = detailIdx !== null ? items[detailIdx] : null

  const arrowStyle: React.CSSProperties = {
    background: 'none',
    border: '1px solid #2a2a3e',
    color: '#9ca3af',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
  }

  return (
    <>
      {/* Popup modal when an event is clicked */}
      {selectedIdx !== null && detailEntry && (
        <div
          onClick={() => setSelectedIdx(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0d0d14',
              border: '1px solid #2a2a3e',
              padding: '1.5rem 2rem',
              maxWidth: 560,
              width: '90%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ color: entryColour(detailEntry), fontWeight: 700, fontSize: '1rem', letterSpacing: '0.06em' }}>
                {kindLabel(detailEntry)}
              </span>
              <button
                onClick={() => setSelectedIdx(null)}
                style={{
                  background: 'none', border: '1px solid #374151', color: '#9ca3af',
                  padding: '4px 12px', cursor: 'pointer', fontSize: '0.85rem',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                close
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '0.8rem', wordBreak: 'break-all' }}>
              subject: <span style={{ color: '#e0e0e0', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>{detailEntry.subject}</span>
            </div>

            <div style={{ fontSize: '1rem', color: '#c0c0c0', lineHeight: 1.6, marginBottom: '1rem' }}>
              {detailEntry.description ?? defaultDescription(detailEntry)}
            </div>

            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              kind {detailEntry.kind} {detailEntry.anonymous ? '(anonymous)' : '(public)'} | {new Date(detailEntry.timestamp * 1000).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(8, 9, 13, 0.97)',
        borderTop: '1px solid #1a1a2e',
        zIndex: 100,
      }}
    >

      {/* Scrollable event strip with nav arrows */}
      <div style={{ display: 'flex', height: 56, alignItems: 'stretch' }}>
        {/* Left arrow */}
        <button onClick={scrollLeft} style={arrowStyle}>&larr;</button>

        {/* Fixed label */}
        <div style={{
          padding: '0 1rem',
          fontSize: '0.75rem',
          color: '#7b68ee',
          letterSpacing: '0.1em',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600,
          flexShrink: 0,
          borderLeft: '1px solid #1a1a2e',
          borderRight: '1px solid #1a1a2e',
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(8, 9, 13, 0.97)',
        }}>
          EVENT LOG
        </div>

        {/* Scrollable items */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            gap: '2px',
            padding: '0 4px',
          }}
          onMouseEnter={() => { pausedRef.current = true }}
          onMouseLeave={() => { pausedRef.current = false; setHoveredIdx(null) }}
        >
          {items.length === 0 && (
            <span style={{ fontSize: '0.85rem', color: '#6b7280', padding: '6px 10px', whiteSpace: 'nowrap' }}>
              Awaiting events...
            </span>
          )}
          {items.map((entry, i) => {
            // Separator marker for screen transitions
            if (entry.separator) {
              return (
                <span
                  key={`sep-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '4px 12px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: '#2a2a3e', fontSize: '1rem', fontFamily: "'JetBrains Mono', monospace" }}>||</span>
                  <span style={{ color: '#7b68ee', fontSize: '0.7rem', letterSpacing: '0.15em', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {entry.separator}
                  </span>
                  <span style={{ color: '#2a2a3e', fontSize: '1rem', fontFamily: "'JetBrains Mono', monospace" }}>||</span>
                </span>
              )
            }

            const b = badge(entry)
            const isSelected = selectedIdx === i
            const isHovered = hoveredIdx === i
            return (
              <span
                key={`${entry.timestamp}-${i}`}
                onMouseEnter={() => setHoveredIdx(i)}
                onClick={() => setSelectedIdx(isSelected ? null : i)}
                style={{
                  fontSize: '0.9rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: entryColour(entry),
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  background: isSelected ? 'rgba(123, 104, 238, 0.15)' : isHovered ? 'rgba(123, 104, 238, 0.08)' : 'transparent',
                  borderBottom: isSelected ? '2px solid #7b68ee' : isHovered ? '1px solid #7b68ee' : '1px solid transparent',
                  transition: 'background 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  animation: i < 3 ? 'event-enter 0.3s ease-out' : 'none',
                }}
              >
                <span style={{ opacity: 0.6 }}>{kindLabel(entry)}</span>
                {' '}
                {truncate(entry.subject)}
                {b && (
                  <span style={{
                    marginLeft: '0.3rem',
                    fontWeight: 700,
                    color: isAlertDuress(entry) ? '#dc2626' : entry.kind === 20078 ? '#22c55e' : '#d97706',
                  }}>
                    {b}
                  </span>
                )}
              </span>
            )
          })}
        </div>

        {/* Right arrow */}
        <button onClick={scrollRight} style={arrowStyle}>&rarr;</button>
      </div>

      <style>{`
        div[style*="scrollbar-width: none"]::-webkit-scrollbar { display: none; }
        @keyframes event-enter {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
    </>
  )
}
