import { useEffect, useState, useMemo, useRef } from 'react'
import { journalists } from '../data/journalists.js'
import { source } from '../data/source.js'
import { createTrustCircle, contributeAssertion, aggregateContributions } from 'nostr-veil/proof'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

function highlightJson(json: string): (React.JSX.Element | string)[] {
  const parts: (React.JSX.Element | string)[] = []
  const regex = /("veil-[^"]*")|("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(\b-?\d+(?:\.\d+)?\b)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(json)) !== null) {
    if (match.index > lastIndex) {
      parts.push(json.slice(lastIndex, match.index))
    }

    if (match[1]) {
      parts.push(<span key={key++} style={{ color: '#7b68ee', fontWeight: 600 }}>{match[1]}</span>)
    } else if (match[2]) {
      parts.push(<span key={key++} style={{ color: '#88a0d0' }}>{match[2]}</span>)
      parts.push(':')
    } else if (match[3]) {
      parts.push(<span key={key++} style={{ color: '#6a9955' }}>{match[3]}</span>)
    } else if (match[4]) {
      parts.push(<span key={key++} style={{ color: '#b5cea8' }}>{match[4]}</span>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < json.length) {
    parts.push(json.slice(lastIndex))
  }

  return parts
}

export function Veil({ flow }: Props) {
  const [status, setStatus] = useState('Initialising...')
  const [event, setEvent] = useState<Record<string, unknown> | null>(null)
  const [aggregateScore, setAggregateScore] = useState<number | null>(null)
  const didRun = useRef(false)

  const pubkeys = useMemo(() => journalists.map(j => j.publicKey), [])

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true

    const run = async () => {
      setStatus('Creating trust circle from 8 public keys...')
      await pause(400)

      const circle = createTrustCircle(pubkeys)

      setStatus('Collecting ring-signed attestations...')
      await pause(400)

      const contributions = journalists.map((j, i) => {
        const score = flow.state.scores.get(i) ?? 50
        return contributeAssertion(
          circle,
          source.publicKey,
          { rank: score },
          j.privateKey,
          circle.members.indexOf(j.publicKey),
        )
      })

      setStatus('Aggregating contributions via LSAG...')
      await pause(400)

      const template = aggregateContributions(circle, source.publicKey, contributions)
      const fullEvent = {
        ...template,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
        id: '(unsigned — ring-signed proof, no single author)',
        sig: '(N/A — proof is in veil-sig tags)',
      }

      const rankTag = template.tags.find((t: string[]) => t[0] === 'rank')
      if (rankTag) setAggregateScore(parseInt(rankTag[1], 10))

      setEvent(fullEvent as Record<string, unknown>)
      flow.setAggregatedEvent(template)
      setStatus('Aggregation complete')
    }

    run().catch(err => setStatus(`Error: ${String((err as Error).message)}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const jsonStr = event ? JSON.stringify(event, null, 2) : null

  return (
    <div>
      <p style={{ opacity: 0.5, fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Each journalist's score is wrapped in an LSAG ring signature. The aggregation produces
        a single NIP-85 event — provably from circle members, with no way to tell who said what.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        marginBottom: '1.5rem',
        padding: '0.6rem 0.8rem',
        background: '#0d0d14',
        border: '1px solid #1a1a2e',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: event ? '#4ade80' : '#facc15',
        }} />
        <span style={{ fontSize: '0.75rem', color: '#888' }}>{status}</span>
      </div>

      {event && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 280 }}>
            <div style={{
              padding: '1.5rem',
              background: 'rgba(123, 104, 238, 0.05)',
              border: '1px solid rgba(123, 104, 238, 0.2)',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>
                RESULT
              </div>
              <div style={{ fontSize: '1.4rem', color: '#e0e0e0', fontWeight: 500, marginBottom: '0.5rem' }}>
                {journalists.length} of {journalists.length} journalists
              </div>
              <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1rem' }}>
                scored this source at rank <span style={{ color: '#7b68ee', fontWeight: 600, fontSize: '1.1rem' }}>{aggregateScore ?? '—'}</span>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.7rem' }}>
                <div>
                  <div style={{ color: '#555', marginBottom: '0.2rem' }}>Kind</div>
                  <div style={{ color: '#e0e0e0' }}>30382</div>
                </div>
                <div>
                  <div style={{ color: '#555', marginBottom: '0.2rem' }}>Ring size</div>
                  <div style={{ color: '#e0e0e0' }}>8</div>
                </div>
                <div>
                  <div style={{ color: '#555', marginBottom: '0.2rem' }}>Signatures</div>
                  <div style={{ color: '#e0e0e0' }}>{journalists.length}</div>
                </div>
              </div>
            </div>

            <button
              onClick={flow.next}
              style={{
                padding: '0.7rem 2rem',
                background: '#7b68ee',
                border: '1px solid #7b68ee',
                color: '#08080d',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              VERIFY
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 400 }}>
            <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              NIP-85 EVENT
            </div>
            <pre style={{
              background: '#0a0a12',
              border: '1px solid #1a1a2e',
              padding: '1rem',
              fontSize: '0.65rem',
              lineHeight: 1.7,
              maxHeight: 500,
              overflowY: 'auto',
              overflowX: 'auto',
              whiteSpace: 'pre',
              color: '#888',
            }}>
              {jsonStr && highlightJson(jsonStr)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
