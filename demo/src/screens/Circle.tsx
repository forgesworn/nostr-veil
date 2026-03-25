import { useMemo } from 'react'
import { journalists } from '../data/journalists.js'
import { createTrustCircle } from 'nostr-veil/proof'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

function truncate(hex: string): string {
  return hex.slice(0, 8) + '...' + hex.slice(-8)
}

export function Circle({ flow }: Props) {
  const selected = flow.state.selectedJournalistIndex
  const pubkeys = useMemo(() => journalists.map(j => j.publicKey), [])
  const circle = useMemo(() => createTrustCircle(pubkeys), [pubkeys])

  // Position 8 items in a ring using SVG
  const cx = 220
  const cy = 220
  const radius = 170

  return (
    <div>
      <p style={{ opacity: 0.5, fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Eight journalists form a trust circle. Each knows who the others are — but when they
        score a source, no one can tell who said what.
      </p>

      <div style={{ display: 'flex', gap: '3rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* SVG Ring */}
        <div style={{ position: 'relative', width: 440, height: 440, flexShrink: 0 }}>
          <svg width={440} height={440} viewBox="0 0 440 440">
            {/* Dashed circle */}
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1a1a2e" strokeWidth={1} strokeDasharray="4 4" />

            {journalists.map((j, i) => {
              const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
              const x = cx + radius * Math.cos(angle)
              const y = cy + radius * Math.sin(angle)
              const isSelected = selected === i

              return (
                <g
                  key={i}
                  onClick={() => flow.selectJournalist(i)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Glow ring for selected */}
                  {isSelected && (
                    <circle cx={x} cy={y} r={30} fill="none" stroke="#7b68ee" strokeWidth={2} opacity={0.6} />
                  )}

                  {/* Node */}
                  <circle
                    cx={x} cy={y} r={24}
                    fill={isSelected ? '#7b68ee' : '#12121a'}
                    stroke={isSelected ? '#7b68ee' : '#2a2a3e'}
                    strokeWidth={isSelected ? 2 : 1}
                  />

                  {/* Index number */}
                  <text
                    x={x} y={y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isSelected ? '#08080d' : '#666'}
                    fontSize={11}
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={isSelected ? 600 : 400}
                  >
                    {i + 1}
                  </text>

                  {/* Name label */}
                  <text
                    x={x} y={y + 40}
                    textAnchor="middle"
                    fill={isSelected ? '#e0e0e0' : '#666'}
                    fontSize={9}
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {j.name}
                  </text>
                </g>
              )
            })}

            {/* Centre label */}
            <text x={cx} y={cx - 8} textAnchor="middle" fill="#7b68ee" fontSize={10} fontFamily="'JetBrains Mono', monospace" fontWeight={500}>
              TRUST
            </text>
            <text x={cx} y={cx + 8} textAnchor="middle" fill="#7b68ee" fontSize={10} fontFamily="'JetBrains Mono', monospace" fontWeight={500}>
              CIRCLE
            </text>
          </svg>
        </div>

        {/* Details panel */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 500, color: '#7b68ee', marginBottom: '1rem', letterSpacing: '0.1em' }}>
            MEMBERS
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '2rem' }}>
            {journalists.map((j, i) => (
              <div
                key={i}
                onClick={() => flow.selectJournalist(i)}
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
                <span style={{ fontSize: '0.7rem', color: selected === i ? '#7b68ee' : '#444', width: '1.2rem' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '0.8rem', color: selected === i ? '#e0e0e0' : '#888', flex: 1 }}>
                  {j.name}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#444', fontFamily: "'JetBrains Mono', monospace" }}>
                  {truncate(j.publicKey)}
                </span>
              </div>
            ))}
          </div>

          {/* Circle ID */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.3rem', letterSpacing: '0.1em' }}>CIRCLE ID</div>
            <div style={{
              fontSize: '0.7rem',
              color: '#7b68ee',
              background: '#0d0d14',
              padding: '0.6rem',
              border: '1px solid #1a1a2e',
              wordBreak: 'break-all',
              lineHeight: 1.6,
            }}>
              {circle.circleId}
            </div>
          </div>

          {selected !== null && (
            <div style={{
              padding: '0.8rem',
              background: 'rgba(123, 104, 238, 0.05)',
              border: '1px solid rgba(123, 104, 238, 0.2)',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.3rem' }}>YOU ARE</div>
              <div style={{ fontSize: '0.9rem', color: '#e0e0e0' }}>{journalists[selected].name}</div>
            </div>
          )}

          <button
            onClick={flow.next}
            disabled={selected === null}
            style={{
              padding: '0.7rem 2rem',
              background: selected !== null ? '#7b68ee' : 'transparent',
              border: selected !== null ? '1px solid #7b68ee' : '1px solid #333',
              color: selected !== null ? '#08080d' : '#444',
              fontFamily: 'inherit',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: selected !== null ? 'pointer' : 'not-allowed',
              letterSpacing: '0.08em',
            }}
          >
            JOIN THE CIRCLE
          </button>
        </div>
      </div>
    </div>
  )
}
