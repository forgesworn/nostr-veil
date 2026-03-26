import { useEffect, useState, useRef } from 'react'
import { verifyProof } from 'nostr-veil/proof'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
import type { ProofVerification } from 'nostr-veil/proof'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

interface Step {
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export function Verification({ flow }: Props) {
  const { addLogEntry } = useRelay()
  const stepLabels = [
    'Extracting member pubkeys from veil-ring tag',
    'Parsing LSAG signatures from veil-sig tags',
    'Verifying each LSAG signature against the ring of pubkeys',
    'Checking key images, detecting any double-signers',
    'Validating threshold: enough unique signers?',
  ]
  const [steps, setSteps] = useState<Step[]>(stepLabels.map(label => ({ label, status: 'pending' })))
  const [result, setResult] = useState<ProofVerification | null>(null)
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true

    const run = async () => {
      // Log start
      addLogEntry({
        kind: 30382, subject: '', anonymous: false,
        timestamp: Math.floor(Date.now() / 1000),
        description: 'Verification started. Reading veil-ring and veil-sig tags from the ring-endorsed NIP-85 event.',
      })

      // Animate through verification steps
      for (let i = 0; i < stepLabels.length; i++) {
        setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'running' } : s))
        await pause(500)
        setSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'done' } : s))
        await pause(150)
      }

      // Actually verify
      const event = flow.state.aggregatedEvent as { kind: number; tags: string[][]; content: string }
      const verification = verifyProof(event)
      setResult(verification)
      flow.setProofResult(verification)

      // Log result
      addLogEntry({
        kind: 30382, subject: '', anonymous: false,
        timestamp: Math.floor(Date.now() / 1000),
        description: `Verification complete: ${verification.valid ? 'VALID' : 'INVALID'}. ${verification.distinctSigners} distinct signers in a circle of ${verification.circleSize}. ${verification.errors.length === 0 ? 'No errors.' : verification.errors.join(', ')}`,
      })
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>Trust without identity.</strong> Anyone can verify this event came
        from the circle. No private keys needed, no circle membership required. The maths proves
        the scores are legitimate without revealing who scored what.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
        This is what <code style={{ color: '#7b68ee', background: '#0d0d14', padding: '2px 6px' }}>nostr-veil verify</code> does:
        extract the <Tip term="veil-ring" /> (the circle), parse each <Tip term="veil-sig" /> (anonymous signatures), verify every
        <Tip term="LSAG" /> signature against the ring, and check <Tip term="key image">key images</Tip> for double-signers.
      </p>

      <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
        {/* Verification steps */}
        <div style={{ flex: 1, minWidth: 400 }}>
          <div style={{ fontSize: '0.9rem', color: '#b0b0b0', letterSpacing: '0.1em', marginBottom: '1rem' }}>
            VERIFICATION PIPELINE
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '2rem' }}>
            {steps.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.8rem',
                  padding: '0.6rem 0.8rem',
                  background: step.status === 'running' ? 'rgba(123, 104, 238, 0.08)' : '#0d0d14',
                  border: step.status === 'running'
                    ? '1px solid rgba(123, 104, 238, 0.3)'
                    : '1px solid #1a1a2e',
                }}
              >
                <StepIndicator status={step.status} />
                <span style={{
                  fontSize: '1rem',
                  color: step.status === 'done' ? '#e0e0e0'
                    : step.status === 'running' ? '#7b68ee'
                    : '#9ca3af',
                }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {result && (
            <button
              onClick={() => {
                addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'THE REVEAL' })
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
              CONTINUE
            </button>
          )}
        </div>

        {/* Result badge */}
        <div style={{ minWidth: 320 }}>
          {result && (
            <>
              {/* Badge */}
              <div style={{
                padding: '2rem',
                background: result.valid ? 'rgba(74, 222, 128, 0.05)' : 'rgba(248, 113, 113, 0.05)',
                border: result.valid ? '2px solid rgba(74, 222, 128, 0.3)' : '2px solid rgba(248, 113, 113, 0.3)',
                textAlign: 'center',
                marginBottom: '2rem',
              }}>
                <div style={{
                  width: 64, height: 64,
                  borderRadius: '50%',
                  background: result.valid ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                  border: result.valid ? '2px solid #4ade80' : '2px solid #f87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  fontSize: '1.5rem',
                }}>
                  {result.valid ? '\u2713' : '\u2717'}
                </div>
                <div style={{
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: result.valid ? '#4ade80' : '#f87171',
                  letterSpacing: '0.15em',
                  marginBottom: '0.3rem',
                }}>
                  {result.valid ? 'VALID' : 'INVALID'}
                </div>
                <div style={{ fontSize: '0.95rem', color: '#c0c0c0' }}>
                  Ring signature proof verified
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <StatRow label="Circle size" value={String(result.circleSize)} />
                <StatRow label="Threshold" value={`${result.threshold} / ${result.circleSize}`} />
                <StatRow label="Distinct signers" value={String(result.distinctSigners)} />
                <StatRow label="Errors" value={result.errors.length === 0 ? 'None' : result.errors.join(', ')} error={result.errors.length > 0} />
              </div>
            </>
          )}

          {!result && (
            <div style={{
              padding: '2rem',
              background: '#0d0d14',
              border: '1px dashed #1a1a2e',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                Verifying...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepIndicator({ status }: { status: Step['status'] }) {
  if (status === 'done') {
    return (
      <div style={{
        width: 16, height: 16,
        borderRadius: '50%',
        background: 'rgba(74, 222, 128, 0.2)',
        border: '1px solid #4ade80',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.55rem', color: '#4ade80',
      }}>
        {'\u2713'}
      </div>
    )
  }

  if (status === 'running') {
    return (
      <div style={{
        width: 16, height: 16,
        borderRadius: '50%',
        border: '2px solid #7b68ee',
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
      }} />
    )
  }

  return (
    <div style={{
      width: 16, height: 16,
      borderRadius: '50%',
      border: '1px solid #374151',
    }} />
  )
}

function StatRow({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0.5rem 0.8rem',
      background: '#0d0d14',
      border: '1px solid #1a1a2e',
    }}>
      <span style={{ fontSize: '0.95rem', color: '#b0b0b0' }}>{label}</span>
      <span style={{ fontSize: '1rem', color: error ? '#f87171' : '#e0e0e0', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
