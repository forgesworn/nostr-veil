import { useEffect, useState, useMemo, useRef } from 'react'
import { journalists } from '../data/journalists.js'
import { source } from '../data/source.js'
import { createTrustCircle, contributeAssertion, aggregateContributions } from 'nostr-veil/proof'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
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
  const { addLogEntry } = useRelay()

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
        const c = contributeAssertion(
          circle,
          source.publicKey,
          { rank: score },
          j.privateKey,
          circle.members.indexOf(j.publicKey),
        )
        // Log each NIP-VA attestation created during contribution
        addLogEntry({
          kind: 31000,
          subject: source.publicKey,
          anonymous: true,
          timestamp: Math.floor(Date.now() / 1000),
          description: `NIP-VA (nostr-attestations). ${j.name} created a kind 31000 attestation anchoring their LSAG contribution. This links the ring signature to a verifiable Nostr event.`,
        })
        return c
      })

      setStatus('Aggregating contributions via LSAG...')
      await pause(400)

      const template = aggregateContributions(circle, source.publicKey, contributions)

      // Log the aggregated ring endorsement
      addLogEntry({
        kind: 30382,
        subject: source.publicKey,
        anonymous: true,
        timestamp: Math.floor(Date.now() / 1000),
        description: `NIP-85 ring-endorsed user assertion (kind 30382). ${contributions.length} anonymous LSAG signatures aggregated into a single event with veil-ring and veil-sig tags. Median rank computed from all contributions.`,
      })

      const fullEvent = {
        ...template,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
        id: '(unsigned; ring-signed proof, no single author)',
        sig: '(N/A; proof is in veil-sig tags)',
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
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>This is the core innovation.</strong> Each journalist's score is wrapped in an <Tip term="LSAG" /> <Tip term="ring signature" /> and
        aggregated into a single, standard <Tip term="NIP-85" /> kind 30382 event. Any Nostr client can read
        this event, but no one can tell which journalist gave which score.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
        The <Tip term="veil-ring" /> tag lists the circle's public keys. Each <Tip term="veil-sig" /> tag contains an
        anonymous LSAG signature with a unique <Tip term="key image" />, preventing any journalist from scoring twice.
        Watch the event being constructed below.
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
        <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{status}</span>
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
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>
                RESULT
              </div>
              <div style={{ fontSize: '1.4rem', color: '#e0e0e0', fontWeight: 500, marginBottom: '0.5rem' }}>
                {journalists.length} of {journalists.length} journalists
              </div>
              <div style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '1rem' }}>
                scored this source at rank <span style={{ color: '#7b68ee', fontWeight: 600, fontSize: '1.1rem' }}>{aggregateScore ?? '-'}</span>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '0.2rem' }}>Kind</div>
                  <div style={{ color: '#e0e0e0' }}>30382</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '0.2rem' }}>Ring size</div>
                  <div style={{ color: '#e0e0e0' }}>8</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', marginBottom: '0.2rem' }}>Signatures</div>
                  <div style={{ color: '#e0e0e0' }}>{journalists.length}</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'VERIFICATION' })
                flow.next()
              }}
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
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              NIP-85 EVENT
            </div>
            <pre style={{
              background: '#0a0a12',
              border: '1px solid #1a1a2e',
              padding: '1rem',
              fontSize: '0.85rem',
              lineHeight: 1.7,
              maxHeight: 500,
              overflowY: 'auto',
              overflowX: 'auto',
              whiteSpace: 'pre',
              color: '#9ca3af',
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
