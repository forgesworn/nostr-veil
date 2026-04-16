import { useState, useMemo, useCallback, useEffect } from 'react'
import { journalists } from '../data/journalists.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { schnorr } from '@noble/curves/secp256k1.js'
import { fromNsec, derive } from 'nsec-tree/core'
import { createBlindProof, createFullProof, verifyProof as verifyLinkageProof } from 'nsec-tree/proof'
import { signEvent } from '../../../src/signing.js'
import { publishToRelay, publishToRelays, DEMO_RELAY } from '../publish.js'
import { Tip } from '../components/Tooltip.js'
import { useRelay } from '../components/RelayProvider.js'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

declare global {
  interface Window {
    nostr?: {
      signEvent: (e: Record<string, unknown>) => Promise<Record<string, unknown>>
      getPublicKey: () => Promise<string>
      heartwood?: { switch: (target: string) => Promise<{ npub?: string }> }
    }
  }
}

interface Props { flow: ReturnType<typeof useVeilFlow> }

function truncate(hex: string, n = 10): string {
  if (hex.length <= n * 2 + 3) return hex
  return hex.slice(0, n) + '...' + hex.slice(-n)
}

export function Reveal({ flow }: Props) {
  const selected = flow.state.selectedJournalistIndex!
  const journalist = journalists[selected]
  const { addLogEntry } = useRelay()

  const isHardware = flow.state.identityMode === 'heartwood'
  const [revealed, setRevealed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signingStage, setSigningStage] = useState('')
  const [realNpub, setRealNpub] = useState<string | null>(null)
  const [proofMode, setProofMode] = useState<'blind' | 'full'>('blind')

  // Fetch the real master npub from Bark (Heartwood hardware signer, hardware mode only)
  useEffect(() => {
    if (isHardware && window.nostr) {
      window.nostr.getPublicKey().then(pk => setRealNpub(pk)).catch(() => {})
    }
  }, [isHardware])

  // The veil-demo-journalist persona was derived from the Heartwood master
  // via `npx nostr-bray persona "veil-demo-journalist"` (nsec-tree)
  const DEMO_PERSONA_NPUB = 'npub1lq3h6096ssgxhmn5ckplqae2rwzj6vmq7qvxatj7uq59ejj03a4s2r7gmv'
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

  // Step 1: Generate the proof locally (no signing)
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
      kind: 31000,
      subject: proofA.masterPubkey,
      anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `nostr-veil disclosure proof generated (${proofMode}). ${journalist.name} proved common ownership of anonymous and public identities. Both proofs ${validA && validB ? 'verified' : 'FAILED'}.`,
    })

    // In demo mode, create a kind 31000 disclosure event with embedded kind 1 ownership proof
    if (flow.state.identityMode === 'demo') {
      const masterPubHex = journalist.publicKey
      const personaPubHex = bytesToHex(pub.publicKey)
      const now = Math.floor(Date.now() / 1000)

      // Inner kind 1: master claims ownership of derived persona
      const innerSigned = signEvent({
        kind: 1,
        tags: [['child', personaPubHex]],
        content: `nsec-tree:own|${masterPubHex}|${personaPubHex}`,
        created_at: now,
      }, journalist.privateKey)

      // Outer kind 31000: disclosure wrapper
      const outerSigned = signEvent({
        kind: 31000,
        tags: [
          ['d', 'veil-disclosure:master'],
          ['type', 'ownership-claim'],
          ['proof-type', 'heartwood-attestation'],
          ['master-pubkey', masterPubHex],
          ['persona-pubkey', personaPubHex],
        ],
        content: JSON.stringify(innerSigned),
        created_at: now,
      }, journalist.privateKey)

      flow.addGeneratedEvent(outerSigned)
      publishToRelay(outerSigned)
    }

    root.destroy()
  }, [journalist.privateKey, journalist.publicKey, journalist.name, proofMode, flow, addLogEntry])

  // Step 2: Sign and publish via Bark (separate action)
  const doPublish = useCallback(async () => {
    const nostr = window.nostr
    if (!nostr) return
    if (!nostr.heartwood) {
      console.error('[reveal] nostr.heartwood is absent — cannot publish attestation')
      return
    }

    setSigning(true)
    const withTimeout = <T,>(p: Promise<T>, ms = 5000): Promise<T | undefined> =>
      Promise.race([p, new Promise<undefined>(r => setTimeout(r, ms))])
    try {
      // Warm up Bark and capture persona pubkey (current key before any switch)
      let personaPubkey = ''
      try { personaPubkey = await nostr.getPublicKey() } catch { /* warm up */ }
      await new Promise(r => setTimeout(r, 600))

      // In bunker mode, heartwood.switch exists but throws.
      // Try the master/persona dance; if switching fails, sign both events
      // with the active key and note the limitation.
      let masterPubkey: string | undefined
      let canSwitch = true

      // Switch to master
      setSigningStage('switching to master...')
      try {
        await withTimeout(nostr.heartwood.switch('master'))
        masterPubkey = await withTimeout(nostr.getPublicKey(), 5000)
      } catch (e) {
        console.warn('[reveal] switch to master failed (bunker mode?):', e)
        canSwitch = false
      }
      if (!masterPubkey) {
        // Bunker mode or switch failed — use the only key we have
        masterPubkey = personaPubkey || await nostr.getPublicKey()
      }

      // Sign attestation event as master (or active key in bunker mode)
      setSigningStage('signing attestation...')
      const attestationUnsigned = {
        kind: 1,
        tags: [['child', personaPubkey]],
        content: `nsec-tree:own|${masterPubkey}|${personaPubkey}`,
        created_at: Math.floor(Date.now() / 1000),
      }
      const attestationEvent = await nostr.signEvent(attestationUnsigned)

      // Switch back to persona (skip if switching unavailable)
      if (canSwitch) {
        setSigningStage('switching to persona...')
        try {
          await withTimeout(nostr.heartwood.switch('persona/veil-demo-journalist'))
          const switchedBack = await withTimeout(nostr.getPublicKey(), 5000)
          if (switchedBack) personaPubkey = switchedBack
        } catch (e) {
          console.warn('[reveal] switch to persona failed:', e)
        }
      }

      // Sign outer kind 31000 as persona (NIP-VA ownership-claim)
      setSigningStage('publishing...')
      const outer = {
        kind: 31000,
        tags: [
          ['d', 'veil-disclosure:master'],
          ['type', 'ownership-claim'],
          ['proof-type', 'heartwood-attestation'],
          ['master-pubkey', String(attestationEvent.pubkey ?? '')],
          ['persona-pubkey', personaPubkey],
        ],
        content: JSON.stringify(attestationEvent),
        created_at: Math.floor(Date.now() / 1000),
      }
      const signed = await nostr.signEvent(outer)

      // Publish to relay (via persistent pool -- survives demo pauses)
      try {
        const accepted = await publishToRelays([DEMO_RELAY], signed)
        console.log(`[reveal] kind 31000 published, ${accepted} relay(s) accepted`)
      } catch (pubErr) {
        console.error('[reveal] relay publish failed:', pubErr)
      }

      addLogEntry({
        kind: 31000,
        subject: String(attestationEvent.pubkey ?? ''),
        anonymous: false,
        timestamp: Math.floor(Date.now() / 1000),
        description: `Heartwood disclosure signed and published (kind 31000, type: ownership-claim). Event ID: ${String(signed.id ?? '').slice(0, 12)}...`,
      })
    } catch (err) {
      console.error('[reveal] Bark sign failed:', err)
    } finally {
      setSigning(false)
      setSigningStage('')
    }
  }, [addLogEntry])

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

      {/* Heartwood master -> persona lineage */}
      {realNpub && (
        <div style={{
          padding: '1rem 1.2rem',
          marginBottom: '1rem',
          background: '#0a0a12',
          border: '1px solid rgba(123, 104, 238, 0.2)',
        }}>
          <div style={{ fontSize: '0.7rem', color: '#7b68ee', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
            NSEC-TREE DERIVATION (REAL)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>Heartwood Master</div>
              <div style={{ fontSize: '0.8rem', color: '#e0e0e0', wordBreak: 'break-all' }}>
                {realNpub.slice(0, 20)}...{realNpub.slice(-8)}
              </div>
            </div>
            <div style={{ color: '#7b68ee', fontSize: '1.2rem', flexShrink: 0 }}>&#x2192;</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>
                nostr:persona:veil-demo-journalist
              </div>
              <div style={{ fontSize: '0.8rem', color: '#7b68ee', wordBreak: 'break-all' }}>
                {DEMO_PERSONA_NPUB.slice(0, 20)}...{DEMO_PERSONA_NPUB.slice(-8)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.6rem', lineHeight: 1.5 }}>
            This journalist persona was derived on-device from the Heartwood ESP32 master key
            using <strong style={{ color: '#c0c0c0' }}>nsec-tree</strong>. The master key never
            leaves the hardware. Below, the linkage proof demonstrates that both identities
            share the same root.
          </div>
        </div>
      )}

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
          disabled={signing}
          style={{
            padding: '0.8rem 2.5rem',
            background: signing ? 'transparent' : '#7b68ee',
            border: '1px solid #7b68ee',
            color: signing ? '#7b68ee' : '#08080d',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: signing ? 'not-allowed' : 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          {signing ? 'SIGNING...' : 'REVEAL IDENTITY'}
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

          {/* BIP-340 live verification */}
          <div style={{
            marginTop: '1rem', padding: '0.8rem',
            background: '#08080d', border: '1px solid #1a1a2e',
          }}>
            <div style={{ fontSize: '0.7rem', color: '#4ade80', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
              BIP-340 SCHNORR VERIFICATION (LIVE)
            </div>
            {(() => {
              // Run BIP-340 verification step by step
              const attestA = proofMode === 'blind'
                ? `nsec-tree:own|${proofData.masterPubkey}|${proofData.childA}`
                : `nsec-tree:link|${proofData.masterPubkey}|${proofData.childA}|nostr:persona:anonymous|0`
              const attestB = proofMode === 'blind'
                ? `nsec-tree:own|${proofData.masterPubkey}|${proofData.childB}`
                : `nsec-tree:link|${proofData.masterPubkey}|${proofData.childB}|nostr:persona:public|0`

              let verifyA = false, verifyB = false
              try {
                verifyA = schnorr.verify(
                  hexToBytes(proofData.sigA),
                  new TextEncoder().encode(attestA),
                  hexToBytes(proofData.masterPubkey),
                )
              } catch { /* */ }
              try {
                verifyB = schnorr.verify(
                  hexToBytes(proofData.sigB),
                  new TextEncoder().encode(attestB),
                  hexToBytes(proofData.masterPubkey),
                )
              } catch { /* */ }

              const codeStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }
              const line = (colour: string, text: string) => (
                <div style={{ ...codeStyle, color: colour, padding: '0.15rem 0' }}>{text}</div>
              )

              return (
                <div style={{ overflowX: 'auto' }}>
                  {line('#6b7280', '// Proof A: Anonymous persona')}
                  {line('#88a0d0', `attestation = "${attestA.length > 80 ? attestA.slice(0, 40) + '...' + attestA.slice(-20) : attestA}"`)}
                  {line('#88a0d0', `signature   = ${proofData.sigA.slice(0, 32)}...`)}
                  {line('#88a0d0', `masterPub   = ${proofData.masterPubkey.slice(0, 32)}...`)}
                  {line('#9ca3af', 'schnorr.verify(sig, attestation, masterPub)')}
                  {line(verifyA ? '#4ade80' : '#f87171', verifyA ? '  => true  (BIP-340 valid)' : '  => false (INVALID)')}
                  <div style={{ height: '0.4rem' }} />
                  {line('#6b7280', '// Proof B: Public identity')}
                  {line('#88a0d0', `attestation = "${attestB.length > 80 ? attestB.slice(0, 40) + '...' + attestB.slice(-20) : attestB}"`)}
                  {line('#88a0d0', `signature   = ${proofData.sigB.slice(0, 32)}...`)}
                  {line('#9ca3af', 'schnorr.verify(sig, attestation, masterPub)')}
                  {line(verifyB ? '#4ade80' : '#f87171', verifyB ? '  => true  (BIP-340 valid)' : '  => false (INVALID)')}
                  <div style={{ height: '0.4rem' }} />
                  {line('#6b7280', '// Same master pubkey signs both attestations')}
                  {line('#6b7280', '// => both personas belong to the same Heartwood identity')}
                </div>
              )
            })()}
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
            <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0, marginLeft: '1rem' }}>
              {isHardware && (
                <button
                  onClick={doPublish}
                  disabled={signing}
                  style={{
                    padding: '0.5rem 1.5rem',
                    background: signing ? 'transparent' : '#7b68ee',
                    border: '1px solid #7b68ee',
                    color: signing ? '#7b68ee' : '#08080d',
                    fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 500,
                    cursor: signing ? 'not-allowed' : 'pointer', letterSpacing: '0.06em',
                  }}
                >
                  {signing ? signingStage.toUpperCase() : 'PUBLISH VIA BARK'}
                </button>
              )}
              <button
                onClick={() => {
                  addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'RECAP' })
                  flow.next()
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: 'transparent',
                  border: '1px solid #374151',
                  color: '#9ca3af',
                  fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 500,
                  cursor: 'pointer', letterSpacing: '0.06em',
                }}
              >
                RECAP
              </button>
            </div>
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
