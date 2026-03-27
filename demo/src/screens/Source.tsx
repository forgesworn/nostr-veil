import { useState, useEffect, useRef, useCallback } from 'react'
import { journalists } from '../data/journalists.js'
import { source } from '../data/source.js'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

function truncate(hex: string): string {
  return hex.slice(0, 10) + '...' + hex.slice(-6)
}

/** Deterministic score for NPC journalists: (index * 11 + 25) clamped to 0-100 */
function npcScore(index: number): number {
  return Math.min(100, Math.max(0, index * 11 + 25))
}

interface AttestationCard {
  journalistName: string
  score: number
  timestamp: number
}

export function Source({ flow }: Props) {
  const selected = flow.state.selectedJournalistIndex!
  const userScore = flow.state.scores.get(selected) ?? null
  const [feed, setFeed] = useState<AttestationCard[]>([])
  const [npcsDone, setNpcsDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { addLogEntry } = useRelay()

  const handleSubmit = useCallback(() => {
    addLogEntry({
      kind: 30382,
      subject: source.publicKey,
      anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `${journalists.length} journalists submitted NIP-85 credibility scores for the source. Scores range from 0 to 100. These will be aggregated via LSAG ring signatures in the next step.`,
    })
    addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'THE VEIL' })
    flow.next()
  }, [addLogEntry, flow])

  // Drip-feed NPC attestations one at a time
  useEffect(() => {
    const npcs = journalists
      .map((j, i) => ({ j, i }))
      .filter(({ i }) => i !== selected)

    let idx = 0
    const drip = () => {
      if (idx >= npcs.length) {
        setNpcsDone(true)
        return
      }
      const { j, i } = npcs[idx]
      const score = npcScore(i)
      flow.setScore(i, score)
      setFeed(prev => [{
        journalistName: j.name,
        score,
        timestamp: Math.floor(Date.now() / 1000),
      }, ...prev])
      addLogEntry({
        kind: 31000,
        subject: source.publicKey,
        anonymous: false,
        timestamp: Math.floor(Date.now() / 1000),
        description: `${j.name} scored the source at ${score}. NIP-VA attestation (kind 31000).`,
      })
      idx++
      timerRef.current = setTimeout(drip, 400)
    }
    timerRef.current = setTimeout(drip, 600)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sliderLoggedRef = useRef(false)

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    flow.setScore(selected, val)
    // Log only once when the user first moves the slider
    if (!sliderLoggedRef.current) {
      sliderLoggedRef.current = true
      addLogEntry({
        kind: 30382,
        subject: source.publicKey,
        anonymous: false,
        timestamp: Math.floor(Date.now() / 1000),
        description: `Score set to ${val} for source by ${journalists[selected].name}. NIP-85 credibility metric (0 to 100).`,
      })
    }
  }

  const allReady = npcsDone && userScore !== null

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        A whistleblower approaches the circle. Each journalist independently scores the
        source's credibility using the <Tip term="NIP-85" /> rank metric (0–100). In standard NIP-85, each
        score would be published under the journalist's real identity, making them a target.
        With nostr-veil, their individual scores stay private.
      </p>
      <p style={{ color: '#7b68ee', fontSize: '1.05rem', marginBottom: '2rem' }}>
        Use the slider to set your score. The other journalists are scoring in parallel.
      </p>

      <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
        {/* Left: Source info + your score */}
        <div style={{ flex: 1, minWidth: 300 }}>
          {/* Source card */}
          <div style={{
            padding: '1.2rem',
            background: '#0d0d14',
            border: '1px solid #1a1a2e',
            marginBottom: '2rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
              <div style={{
                width: 36, height: 36,
                background: 'rgba(123, 104, 238, 0.15)',
                border: '1px solid rgba(123, 104, 238, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', color: '#7b68ee',
              }}>
                ?
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', color: '#e0e0e0', fontWeight: 500 }}>{source.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{truncate(source.publicKey)}</div>
              </div>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#9ca3af', lineHeight: 1.5 }}>
              {source.description}
            </p>
          </div>

          {/* Your score slider */}
          <div style={{
            padding: '1.2rem',
            background: userScore !== null ? 'rgba(123, 104, 238, 0.05)' : '#0d0d14',
            border: userScore !== null ? '1px solid rgba(123, 104, 238, 0.2)' : '1px solid #1a1a2e',
            marginBottom: '2rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#7b68ee', letterSpacing: '0.1em' }}>
                YOUR CREDIBILITY SCORE
              </div>
              <div style={{ fontSize: '1.2rem', color: userScore !== null ? '#e0e0e0' : '#7b68ee', fontWeight: 500 }}>
                {userScore !== null ? userScore : 'Move the slider'}
              </div>
            </div>

            <div style={{ position: 'relative', marginBottom: '0.8rem' }}>
              <input
                type="range"
                min={0}
                max={100}
                value={userScore ?? 50}
                onChange={handleSlider}
                style={{
                  width: '100%',
                  height: 4,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: `linear-gradient(to right, #7b68ee ${userScore ?? 50}%, #1a1a2e ${userScore ?? 50}%)`,
                  outline: 'none',
                  cursor: 'pointer',
                  accentColor: '#7b68ee',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
              <span>0: not credible</span>
              <span>100: highly credible</span>
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.6rem' }}>
            Scoring as: <span style={{ color: '#7b68ee' }}>{journalists[selected].name}</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!allReady}
            style={{
              padding: '0.7rem 2rem',
              background: allReady ? '#7b68ee' : 'transparent',
              border: allReady ? '1px solid #7b68ee' : '1px solid #374151',
              color: allReady ? '#08080d' : '#6b7280',
              fontFamily: 'inherit',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: allReady ? 'pointer' : 'not-allowed',
              letterSpacing: '0.08em',
            }}
          >
            SUBMIT SCORES
          </button>
        </div>

        {/* Right: Attestation feed */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>
            ATTESTATION FEED
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 480, overflowY: 'auto' }}>
            {/* User's own score at top if set */}
            {userScore !== null && (
              <AttestationEntry
                name={journalists[selected].name}
                score={userScore}
                isUser
              />
            )}

            {feed.map((a, i) => (
              <AttestationEntry
                key={i}
                name={a.journalistName}
                score={a.score}
              />
            ))}

            {feed.length === 0 && !userScore && (
              <div style={{ fontSize: '0.85rem', color: '#6b7280', padding: '1rem', textAlign: 'center' }}>
                Waiting for attestations...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AttestationEntry({ name, score, isUser }: { name: string; score: number; isUser?: boolean }) {
  return (
    <div style={{
      padding: '0.6rem 0.8rem',
      background: isUser ? 'rgba(123, 104, 238, 0.08)' : '#0d0d14',
      border: isUser ? '1px solid rgba(123, 104, 238, 0.2)' : '1px solid #1a1a2e',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.85rem', color: isUser ? '#7b68ee' : '#9ca3af' }}>
          {name} {isUser && '(you)'}
        </span>
        <span style={{
          fontSize: '0.8rem',
          fontWeight: 500,
          color: score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171',
        }}>
          {score}
        </span>
      </div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
        kind: 31000 &middot; type: vouch &middot; metric: rank
      </div>
    </div>
  )
}
