import { useState, useMemo, useCallback } from 'react'
import { journalists } from '../data/journalists.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { fromNsec, derive } from 'nsec-tree/core'
import { createBlindProof, createFullProof, verifyProof as verifyLinkageProof } from 'nsec-tree/proof'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

function truncate(hex: string, n = 10): string {
  if (hex.length <= n * 2 + 3) return hex
  return hex.slice(0, n) + '...' + hex.slice(-n)
}

export function Reveal({ flow }: Props) {
  const selected = flow.state.selectedJournalistIndex!
  const journalist = journalists[selected]

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
    root.destroy()
  }, [journalist.privateKey, proofMode, flow])

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
      <p style={{ opacity: 0.5, fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        The story breaks. {journalist.name} decides to reveal their identity — proving that the
        anonymous scorer and the public journalist are the same person, without exposing anyone else in the circle.
      </p>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '2rem' }}>
        {(['blind', 'full'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => switchMode(mode)}
            style={{
              padding: '0.4rem 1rem',
              background: proofMode === mode ? 'rgba(123, 104, 238, 0.15)' : 'transparent',
              border: proofMode === mode ? '1px solid rgba(123, 104, 238, 0.4)' : '1px solid #1a1a2e',
              color: proofMode === mode ? '#7b68ee' : '#555',
              fontFamily: 'inherit',
              fontSize: '0.7rem',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            {mode.toUpperCase()} PROOF
          </button>
        ))}
        <div style={{ fontSize: '0.6rem', color: '#444', alignSelf: 'center', marginLeft: '0.5rem' }}>
          {proofMode === 'blind'
            ? 'Proves common ownership without revealing derivation path'
            : 'Reveals full derivation path (purpose + index)'}
        </div>
      </div>

      {/* Identity cards */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: '2rem' }}>
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
          minWidth: 120,
          gap: '0.5rem',
        }}>
          {revealed ? (
            <>
              <div style={{
                width: 2, height: 40,
                background: proofValid ? '#4ade80' : '#f87171',
              }} />
              <div style={{
                width: 48, height: 48,
                borderRadius: '50%',
                background: proofValid ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                border: proofValid ? '2px solid #4ade80' : '2px solid #f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
              }}>
                {proofValid ? '\u2713' : '\u2717'}
              </div>
              <div style={{ fontSize: '0.6rem', color: proofValid ? '#4ade80' : '#f87171', letterSpacing: '0.1em' }}>
                {proofValid ? 'LINKED' : 'INVALID'}
              </div>
              <div style={{
                width: 2, height: 40,
                background: proofValid ? '#4ade80' : '#f87171',
              }} />
            </>
          ) : (
            <>
              <div style={{ width: 2, height: 40, background: '#1a1a2e' }} />
              <div style={{
                width: 48, height: 48,
                borderRadius: '50%',
                border: '1px dashed #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                color: '#333',
              }}>
                ?
              </div>
              <div style={{ width: 2, height: 40, background: '#1a1a2e' }} />
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

      {/* Proof details */}
      {revealed && proofData && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#0a0a12',
          border: '1px solid #1a1a2e',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>
            LINKAGE PROOF ({proofMode.toUpperCase()})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.65rem' }}>
            <ProofRow label="Master pubkey" value={proofData.masterPubkey} accent />
            <ProofRow label="Child A (anon)" value={proofData.childA} />
            <ProofRow label="Child B (public)" value={proofData.childB} />
            <ProofRow label="Attestation A" value={truncate(proofData.attestationA, 20)} />
            <ProofRow label="Attestation B" value={truncate(proofData.attestationB, 20)} />
            <ProofRow label="Signature A" value={truncate(proofData.sigA, 16)} />
            <ProofRow label="Signature B" value={truncate(proofData.sigB, 16)} />
          </div>

          <div style={{
            marginTop: '1rem',
            padding: '0.6rem 0.8rem',
            background: proofValid ? 'rgba(74, 222, 128, 0.05)' : 'rgba(248, 113, 113, 0.05)',
            border: proofValid ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(248, 113, 113, 0.2)',
            fontSize: '0.7rem',
            color: proofValid ? '#4ade80' : '#f87171',
          }}>
            Both proofs verified: the anonymous scorer and {journalist.name} share the same master key.
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
      minWidth: 240,
      padding: '1.2rem',
      background: '#0d0d14',
      border: `1px solid ${colour === '#7b68ee' ? 'rgba(123, 104, 238, 0.3)' : '#2a2a3e'}`,
    }}>
      <div style={{ fontSize: '0.6rem', color: colour, letterSpacing: '0.15em', marginBottom: '0.8rem', fontWeight: 500 }}>
        {title}
      </div>
      <div style={{ fontSize: '0.9rem', color: '#e0e0e0', marginBottom: '0.5rem' }}>
        {subtitle}
      </div>
      <div style={{
        fontSize: '0.6rem',
        color: '#555',
        wordBreak: 'break-all',
        lineHeight: 1.6,
        background: '#08080d',
        padding: '0.5rem',
        marginBottom: showDetails ? '0.8rem' : 0,
      }}>
        {pubkey}
      </div>
      {showDetails && (
        <div style={{ fontSize: '0.6rem', color: '#444' }}>
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
      borderBottom: '1px solid #111',
    }}>
      <span style={{ color: '#444', minWidth: 110 }}>{label}</span>
      <span style={{
        color: accent ? '#7b68ee' : '#888',
        wordBreak: 'break-all',
        flex: 1,
      }}>
        {value}
      </span>
    </div>
  )
}
