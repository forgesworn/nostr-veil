import type { RingEvent } from './TrustGraphView.js'

interface ControlPanelProps {
  pubkeys: string[]
  onRingEndorse: (event: RingEvent) => void
  onDuress: (pubkey: string) => void
}

export function ControlPanel({ pubkeys, onRingEndorse, onDuress }: ControlPanelProps) {
  const handleRingEndorse = () => {
    if (pubkeys.length < 3) return
    // Pick 3-5 random members as committee, one random subject
    const shuffled = [...pubkeys].sort(() => Math.random() - 0.5)
    const committeeSize = Math.min(3 + Math.floor(Math.random() * 3), shuffled.length - 1)
    const members = shuffled.slice(0, committeeSize)
    const subject = shuffled[committeeSize]
    onRingEndorse({ members, subject })
  }

  const handleDuress = () => {
    if (pubkeys.length === 0) return
    const idx = Math.floor(Math.random() * pubkeys.length)
    onDuress(pubkeys[idx])
  }

  const buttonStyle: React.CSSProperties = {
    padding: '0.7rem 1.4rem',
    background: 'transparent',
    border: '1px solid #2a2a3e',
    color: '#c0c0c0',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.9rem',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '1rem',
        right: '1rem',
        display: 'flex',
        gap: '0.4rem',
        padding: '0.5rem',
        background: 'rgba(8, 9, 13, 0.9)',
        border: '1px solid #1a1a2e',
        zIndex: 15,
      }}
    >
      <button
        style={buttonStyle}
        onClick={handleRingEndorse}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#d97706'
          e.currentTarget.style.color = '#d97706'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#2a2a3e'
          e.currentTarget.style.color = '#9ca3af'
        }}
      >
        RING ENDORSE
      </button>
      <button
        style={buttonStyle}
        onClick={handleDuress}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#dc2626'
          e.currentTarget.style.color = '#dc2626'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#2a2a3e'
          e.currentTarget.style.color = '#9ca3af'
        }}
      >
        SIMULATE DURESS
      </button>
    </div>
  )
}
