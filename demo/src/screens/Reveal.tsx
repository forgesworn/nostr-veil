import { useState, useMemo, useCallback } from 'react'
import { journalists } from '../data/journalists.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { fromNsec, derive } from 'nsec-tree/core'
import { createBlindProof, createFullProof, verifyProof as verifyLinkageProof } from 'nsec-tree/proof'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

function truncate(hex: string, n = 10): string {
  if (hex.length <= n * 2 + 3) return hex
  return hex.slice(0, n) + '...' + hex.slice(-n)
}

export function Reveal({ flow }: Props) {
  const selected = flow.state.selectedJournalistIndex!
  const journalist = journalists[selected]
  const { addLogEntry } = useRelay()

  const [revealed, setRevealed] = useState(false)
  const [proofMode, setProofMode] = useState<'blind' | 'full'>('blind')
  const [proofValid, setProofValid] = useState<boolean | null>(null)
  const [proofData, setProofData] = useState<{ masterPubkey: string; childA: string; childB: string; attestationA: string; attestationB: string; sigA: string; sigB: string } | null>(null)

  // Derive two identities from the journalist's key
  const identities = useMemo(() => {
    const keyBytes = hexToBytes(journalist.privateKey)
    const root = fromNsec(keyBytes)
    const anon = derive(root, 'nostr:persona:anonymous', 0)
    const pub = derive(root, 'nostr:persona:public', 0)
    const masterPub = root.masterPubkey // this is an npub
    root.destroy()
    return { anon, pub, masterPub }
  }, [journalist.privateKey])

  const doReveal = useCallback(() => {
    const keyBytes = hexToBytes(journalist.privateKey)
    const root = fromNsec(keyBytes)
    const anon = derive(root, 'nostr:persona:anonymous', 0)
    const pub = derive(root, 'nostr:persona:public', 0)

    const proveFn = proofMode === 'blind' ? createBlindProof : createFullProof
    const proofA = proveFn(root, anon)
    const proofB = proveFn(root, pub)

    const validA = verifyLinkageProof(proofA)
    const validB = verifyLinkageProof(proofB)

    setProofValid(validA && validB)
    setProofData({
      masterPubkey: proofA.masterPubkey,
      childA: proofA.childPubkey,
      childB: proofB.childPubkey,
      attestationA: proofA.attestation,
      attestationB: proofB.attestation,
      sigA: proofA.signature,
      sigB: proofB.signature,
    })
    setRevealed(true)

    flow.setDisclosureProofs([proofA, proofB])

    addLogEntry({
      kind: 30078,
      subject: proofA.masterPubkey,
      anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `nostr-veil disclosure (kind 30078). ${journalist.name} proved common ownership of their anonymous and public identities using a ${proofMode} nsec-tree linkage proof. Both proofs ${validA && validB ? 'verified' : 'FAILED'}.`,
    })

    root.destroy()
  }, [journalist.privateKey, proofMode, flow, addLogEntry])

  const switchMode = useCallback((mode: 'blind' | 'full') => {
    setProofMode(mode)
    if (revealed) {
      // Re-generate with new mode
      const keyBytes = hexToBytes(journalist.privateKey)
      const root = fromNsec(keyBytes)
      const anon = derive(root, 'nostr:persona:anonymous', 0)
      const pub = derive(root, 'nostr:persona:public', 0)

      const proveFn = mode === 'blind' ? createBlindProof : createFullProof
      const proofA = proveFn(root, anon)
      const proofB = proveFn(root, pub)

      const validA = verifyLinkageProof(proofA)
      const validB = verifyLinkageProof(proofB)

      setProofValid(validA && validB)
      setProofData({
        masterPubkey: proofA.masterPubkey,
        childA: proofA.childPubkey,
        childB: proofB.childPubkey,
        attestationA: proofA.attestation,
        attestationB: proofB.attestation,
        sigA: proofA.signature,
        sigB: proofB.signature,
      })

      flow.setDisclosureProofs([proofA, proofB])
      root.destroy()
    }
  }, [revealed, journalist.privateKey, flow])

  return (
    <div>
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        <strong style={{ color: '#e0e0e0' }}>Anonymity is the default. Disclosure is voluntary.</strong> The
        story is published. {journalist.name} wants to claim credit for being one of the anonymous
        scorers, perhaps for a journalism award, or legal protection.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Using <Tip term="nsec-tree" />, {journalist.name} has two Nostr identities: an anonymous
        one (used in the circle) and a public one (their real name). A <Tip term="common ownership" /> proof
        links them: "these two accounts are mine." The other seven journalists stay anonymous.
      </p>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {(['blind', 'full'] as const).map(mode => (
          <div
            key={mode}
            onClick={() => switchMode(mode)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '1rem',
              background: proofMode === mode ? 'rgba(123, 104, 238, 0.08)' : '#0d0d14',
              border: proofMode === mode ? '1px solid rgba(123, 104, 238, 0.4)' : '1px solid #1a1a2e',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '1rem', color: proofMode === mode ? '#7b68ee' : '#c0c0c0', fontWeight: 600, marginBottom: '0.4rem' }}>
              {mode === 'blind' ? 'BLIND PROOF' : 'FULL PROOF'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#b0b0b0', lineHeight: 1.5 }}>
              {mode === 'blind'
                ? 'Proves "I was in the circle" without revealing how the identity was derived. Good for: claiming credit, reputation building.'
                : 'Proves ownership AND reveals the derivation path. Good for: legal proceedings, journalism awards, whistleblower protection claims.'}
            </div>
          </div>
        ))}
      </div>

      {/* Identity cards */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {/* Anonymous persona card */}
        <IdentityCard
          title="ANONYMOUS PERSONA"
          subtitle="Circle member"
          pubkey={bytesToHex(identities.anon.publicKey)}
          purpose="nostr:persona:anonymous"
          index={0}
          colour="#7b68ee"
          showDetails={revealed && proofMode === 'full'}
        />

        {/* Connecting proof area */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 80,
          gap: '0.3rem',
        }}>
          {revealed ? (
            <>
              <div style={{ width: 2, height: 24, background: proofValid ? '#4ade80' : '#f87171' }} />
              <div style={{
                width: 40, height: 40,
                borderRadius: '50%',
                background: proofValid ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                border: proofValid ? '2px solid #4ade80' : '2px solid #f87171',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem',
              }}>
                {proofValid ? '\u2713' : '\u2717'}
              </div>
              <div style={{ fontSize: '0.75rem', color: proofValid ? '#4ade80' : '#f87171', letterSpacing: '0.1em' }}>
                LINKED
              </div>
              <div style={{ width: 2, height: 24, background: proofValid ? '#4ade80' : '#f87171' }} />
            </>
          ) : (
            <>
              <div style={{ width: 2, height: 24, background: '#1a1a2e' }} />
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '1px dashed #374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', color: '#9ca3af',
              }}>
                ?
              </div>
              <div style={{ width: 2, height: 24, background: '#1a1a2e' }} />
            </>
          )}
        </div>

        {/* Public identity card */}
        <IdentityCard
          title="PUBLIC IDENTITY"
          subtitle={journalist.name}
          pubkey={bytesToHex(identities.pub.publicKey)}
          purpose="nostr:persona:public"
          index={0}
          colour="#e0e0e0"
          showDetails={revealed && proofMode === 'full'}
        />
      </div>

      {/* Reveal button */}
      {!revealed && (
        <button
          onClick={doReveal}
          style={{
            padding: '0.8rem 2.5rem',
            background: '#7b68ee',
            border: '1px solid #7b68ee',
            color: '#08080d',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          REVEAL IDENTITY
        </button>
      )}

      {/* Proof details — two columns */}
      {revealed && proofData && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem 1.2rem',
          background: '#0a0a12',
          border: '1px solid #1a1a2e',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#b0b0b0', letterSpacing: '0.1em' }}>
              LINKAGE PROOF ({proofMode.toUpperCase()})
            </div>
            <div style={{
              fontSize: '0.9rem',
              color: proofValid ? '#4ade80' : '#f87171',
              fontWeight: 600,
            }}>
              {proofValid ? 'VERIFIED' : 'INVALID'}
            </div>
          </div>

          {/* Master pubkey — full width */}
          <ProofRow label="Master pubkey" value={proofData.masterPubkey} accent />

          {/* Two columns: A on left, B on right */}
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: '#7b68ee', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                ANONYMOUS PERSONA
              </div>
              <ProofRow label="Pubkey" value={proofData.childA} />
              <ProofRow label="Attestation" value={truncate(proofData.attestationA, 20)} />
              <ProofRow label="Signature" value={truncate(proofData.sigA, 16)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: '#e0e0e0', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                PUBLIC IDENTITY
              </div>
              <ProofRow label="Pubkey" value={proofData.childB} />
              <ProofRow label="Attestation" value={truncate(proofData.attestationB, 20)} />
              <ProofRow label="Signature" value={truncate(proofData.sigB, 16)} />
            </div>
          </div>

          <div style={{
            marginTop: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.6rem 0.8rem',
            background: proofValid ? 'rgba(74, 222, 128, 0.05)' : 'rgba(248, 113, 113, 0.05)',
            border: proofValid ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(248, 113, 113, 0.2)',
          }}>
            <span style={{ fontSize: '0.95rem', color: proofValid ? '#4ade80' : '#f87171' }}>
              Both proofs verified. {journalist.name} was in the circle.
            </span>
            <button
              onClick={() => {
                addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'THE NETWORK' })
                flow.next()
              }}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#7b68ee',
                border: '1px solid #7b68ee',
                color: '#08080d',
                fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '0.06em',
                flexShrink: 0, marginLeft: '1rem',
              }}
            >
              VIEW NETWORK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function IdentityCard({ title, subtitle, pubkey, purpose, index, colour, showDetails }: {
  title: string
  subtitle: string
  pubkey: string
  purpose: string
  index: number
  colour: string
  showDetails: boolean
}) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      padding: '1.2rem',
      background: '#0d0d14',
      border: `1px solid ${colour === '#7b68ee' ? 'rgba(123, 104, 238, 0.3)' : '#2a2a3e'}`,
    }}>
      <div style={{ fontSize: '0.75rem', color: colour, letterSpacing: '0.15em', marginBottom: '0.8rem', fontWeight: 500 }}>
        {title}
      </div>
      <div style={{ fontSize: '0.9rem', color: '#e0e0e0', marginBottom: '0.5rem' }}>
        {subtitle}
      </div>
      <div style={{
        fontSize: '0.75rem',
        color: '#6b7280',
        wordBreak: 'break-all',
        lineHeight: 1.6,
        background: '#08080d',
        padding: '0.5rem',
        marginBottom: showDetails ? '0.8rem' : 0,
      }}>
        {pubkey}
      </div>
      {showDetails && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          <div>purpose: <span style={{ color: '#7b68ee' }}>{purpose}</span></div>
          <div>index: <span style={{ color: '#7b68ee' }}>{index}</span></div>
        </div>
      )}
    </div>
  )
}

function ProofRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      gap: '1rem',
      padding: '0.3rem 0',
      borderBottom: '1px solid #1a1a2e',
    }}>
      <span style={{ color: '#9ca3af', minWidth: 110 }}>{label}</span>
      <span style={{
        color: accent ? '#7b68ee' : '#e0e0e0',
        wordBreak: 'break-all',
        flex: 1,
      }}>
        {value}
      </span>
    </div>
  )
}
