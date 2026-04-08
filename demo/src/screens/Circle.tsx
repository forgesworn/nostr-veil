import { useMemo, useCallback, useState, useEffect } from 'react'
import { journalists, connectNip07Identity } from '../data/journalists.js'
import { createTrustCircle } from 'nostr-veil/proof'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

function truncate(hex: string): string {
  return hex.slice(0, 8) + '...' + hex.slice(-6)
}

export function Circle({ flow }: Props) {
  const selected = flow.state.selectedJournalistIndex
  const { addLogEntry } = useRelay()
  const [nip07Connected, setNip07Connected] = useState(false)

  // Auto-detect Bark / NIP-07 signer
  useEffect(() => {
    const detect = async () => {
      const nostr = (window as unknown as { nostr?: { getPublicKey: () => Promise<string> } }).nostr
      if (!nostr) return
      try {
        const pubkey = await nostr.getPublicKey()
        connectNip07Identity(pubkey)
        setNip07Connected(true)
        addLogEntry({
          kind: 0,
          subject: pubkey,
          anonymous: false,
          timestamp: Math.floor(Date.now() / 1000),
          description: `NIP-07 signer detected (Bark). Connected as Donkey: ${pubkey.slice(0, 12)}...`,
        })
      } catch {
        // NIP-07 available but user declined
      }
    }
    detect()
  }, [addLogEntry])

  const pubkeys = useMemo(() => journalists.map(j => j.publicKey), [nip07Connected]) // eslint-disable-line react-hooks/exhaustive-deps
  const circle = useMemo(() => createTrustCircle(pubkeys), [pubkeys])

  const handleSelect = useCallback((index: number) => {
    flow.selectJournalist(index)
    addLogEntry({
      kind: 30382,
      subject: journalists[index].publicKey,
      anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `${journalists[index].name} selected as circle member. You will score as this journalist.`,
    })
  }, [addLogEntry, flow])

  const handleJoin = useCallback(() => {
    addLogEntry({
      kind: 30382,
      subject: circle.circleId,
      anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `Trust circle formed: ${circle.size} journalists. Circle ID: ${circle.circleId.slice(0, 12)}... Each member can now contribute anonymous NIP-85 scores via LSAG ring signatures.`,
    })
    addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'THE SOURCE' })
    flow.next()
  }, [addLogEntry, circle, flow])

  const cx = 200
  const cy = 200
  const radius = 155

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>The problem:</strong> NIP-85 trust scores are only as trustworthy as the people
        publishing them. If a provider can be identified and pressured, the scores are worthless.
      </p>
      <p style={{ color: '#c0c0c0', fontSize: '1.05rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>The solution:</strong> a <Tip term="trust circle" />, a group that scores collectively.
        Each member contributes anonymously via <Tip term="LSAG" /> ring signatures.
        The result is a standard NIP-85 event that anyone can verify came from the circle,
        but no one can tell which member gave which score.
      </p>
      <p style={{ color: '#7b68ee', fontSize: '1.05rem', marginBottom: '2rem' }}>
        Click a journalist to take their role, then press "Join the Circle".
      </p>

      <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* SVG Ring — compact */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '1', flexShrink: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 400 400">
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1a1a2e" strokeWidth={1} strokeDasharray="4 4" />

            {journalists.map((j, i) => {
              const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
              const x = cx + radius * Math.cos(angle)
              const y = cy + radius * Math.sin(angle)
              const isSelected = selected === i

              return (
                <g key={i} onClick={() => handleSelect(i)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <circle cx={x} cy={y} r={34} fill="none" stroke="#7b68ee" strokeWidth={2.5} opacity={0.6} />
                  )}
                  <circle
                    cx={x} cy={y} r={26}
                    fill={isSelected ? '#7b68ee' : '#12121a'}
                    stroke={isSelected ? '#7b68ee' : '#2a2a3e'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    x={x} y={y + 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={isSelected ? '#08080d' : '#d0d0d0'}
                    fontSize={15} fontFamily="'JetBrains Mono', monospace"
                    fontWeight={isSelected ? 700 : 500}
                  >
                    {i + 1}
                  </text>
                  <text
                    x={x} y={y + 42}
                    textAnchor="middle"
                    fill={isSelected ? '#e0e0e0' : '#b0b0b0'}
                    fontSize={11} fontFamily="'JetBrains Mono', monospace"
                  >
                    {j.name}
                  </text>
                </g>
              )
            })}

            <text x={cx} y={cx - 8} textAnchor="middle" fill="#7b68ee" fontSize={14} fontFamily="'JetBrains Mono', monospace" fontWeight={600}>
              TRUST
            </text>
            <text x={cx} y={cx + 10} textAnchor="middle" fill="#7b68ee" fontSize={14} fontFamily="'JetBrains Mono', monospace" fontWeight={600}>
              CIRCLE
            </text>
          </svg>

          {/* YOU ARE + JOIN below the ring, always visible */}
          {selected !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '0.6rem 0.8rem', marginTop: '0.3rem',
              background: 'rgba(123, 104, 238, 0.05)',
              border: '1px solid rgba(123, 104, 238, 0.2)',
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#b0b0b0' }}>YOU ARE</div>
                <div style={{ fontSize: '1.1rem', color: '#e0e0e0', fontWeight: 500 }}>{journalists[selected].name}</div>
              </div>
              <button
                onClick={handleJoin}
                style={{
                  marginLeft: 'auto',
                  padding: '0.6rem 2rem',
                  background: '#7b68ee',
                  border: '1px solid #7b68ee',
                  color: '#08080d',
                  fontFamily: 'inherit', fontSize: '1rem', fontWeight: 600,
                  cursor: 'pointer', letterSpacing: '0.08em',
                }}
              >
                JOIN THE CIRCLE
              </button>
            </div>
          )}
        </div>

        {/* Details panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#7b68ee', marginBottom: '1rem', letterSpacing: '0.1em' }}>
            MEMBERS
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.5rem' }}>
            {journalists.map((j, i) => (
              <div
                key={i}
                onClick={() => handleSelect(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.8rem',
                  padding: '0.5rem 0.8rem',
                  background: selected === i ? 'rgba(123, 104, 238, 0.1)' : 'transparent',
                  border: selected === i ? '1px solid rgba(123, 104, 238, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '0.95rem', color: selected === i ? '#7b68ee' : '#9ca3af', width: '1.5rem' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '1rem', color: selected === i ? '#e0e0e0' : '#c0c0c0', flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {j.name}
                  {j.nip07 && (
                    <span style={{
                      fontSize: '0.65rem',
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      padding: '1px 6px',
                      letterSpacing: '0.06em',
                    }}>
                      BARK
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace" }}>
                  {truncate(j.publicKey)}
                </span>
              </div>
            ))}
          </div>

          {/* Circle ID */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#b0b0b0', marginBottom: '0.3rem', letterSpacing: '0.1em' }}>CIRCLE ID</div>
            <div style={{
              fontSize: '0.9rem', color: '#7b68ee', background: '#0d0d14',
              padding: '0.6rem', border: '1px solid #1a1a2e',
              wordBreak: 'break-all', lineHeight: 1.6,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {circle.circleId}
            </div>
          </div>

          {selected === null && (
            <div style={{ fontSize: '0.95rem', color: '#9ca3af', padding: '0.8rem 0' }}>
              Select a journalist from the circle or the list to continue.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
