import { useState, useEffect } from 'react'
import { bytesToHex } from '@noble/hashes/utils.js'
import { nip19 } from 'nostr-tools'
import { fromNsec, derive } from 'nsec-tree/core'
import { connectNip07Identity, injectDemoIdentity } from '../data/journalists.js'
import { useRelay } from '../components/RelayProvider.js'
import type { useVeilFlow } from '../hooks/useVeilFlow.js'

interface Props { flow: ReturnType<typeof useVeilFlow> }

// ─── hardcoded demo identity ─────────────────────────────────────────────────
// Deterministic seed so events accumulate on the relay across sessions.
// Anyone can paste these commands into their terminal to verify.

const DEMO = {
  nsec:         'nsec1dehhxarj94mx26tv94jx2mt094jx2enpw4k8gtttv4uj6a33yyqqtpll2x',
  masterNpub:   'npub1we5rqxm24age90u320dgy9n8xrmlyvzpg9h0rlqmdkzy4m42mpxq9ujfrw',
  masterHex:    '7668301b6aaf5192bf9153da82166730f7f23041416ef1fc1b6d844aeeaad84c',
  personaPriv:  '81924b28b5b39aeed4ba8b67d9cef0d1e0cc72f9bf9fea7f706e08ddb4b99237',
  personaPub:   '767eae01fe2fea833edcf10442b603775bd513018b2ba7542798c3a7d2dc028b',
  personaNpub:  'npub1wel2uq079l4gx0ku7yzy9dsrwada2ycp3v46w4p8nrp605kuq29svvhrlp',
}

// ─── types ───────────────────────────────────────────────────────────────────

interface DemoIdentity {
  nsec: string
  masterNpub: string
  masterHex: string
  personaNpub: string
  personaPub: string
  isDefault: boolean
}

// ─── component ───────────────────────────────────────────────────────────────

export function Welcome({ flow }: Props) {
  const { addLogEntry } = useRelay()
  const [barkDetected, setBarkDetected] = useState<boolean | null>(null)
  const [identity, setIdentity] = useState<DemoIdentity | null>(null)

  // Detect NIP-07 signer on mount (with timeout — hardware may be offline)
  useEffect(() => {
    let cancelled = false
    const detect = async () => {
      const nostr = (window as unknown as { nostr?: { getPublicKey: () => Promise<string> } }).nostr
      if (!nostr) { setBarkDetected(false); return }
      try {
        const result = await Promise.race([
          nostr.getPublicKey().then(() => true),
          new Promise<false>(r => setTimeout(() => r(false), 15000)),
        ])
        if (!cancelled) setBarkDetected(result)
      } catch {
        if (!cancelled) setBarkDetected(false)
      }
    }
    detect()
    return () => { cancelled = true }
  }, [])

  const handleHeartwood = async () => {
    const nostr = (window as unknown as { nostr?: { getPublicKey: () => Promise<string> } }).nostr
    if (!nostr) return
    try {
      const pubkey = await nostr.getPublicKey()
      connectNip07Identity(pubkey)
      flow.setIdentityMode('heartwood')
      addLogEntry({
        kind: 0, subject: pubkey, anonymous: false,
        timestamp: Math.floor(Date.now() / 1000),
        description: `Heartwood connected via NIP-07 (Bark). Master pubkey: ${pubkey.slice(0, 12)}...`,
      })
      addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'THE CIRCLE' })
      flow.next()
    } catch (err) {
      console.error('[welcome] Bark connection failed:', err)
    }
  }

  const activate = (nsec: string, masterNpub: string, masterHex: string, personaPriv: string, personaPub: string, personaNpub: string, isDefault: boolean) => {
    injectDemoIdentity(personaPriv, personaPub)
    flow.setIdentityMode('demo')
    setIdentity({ nsec, masterNpub, masterHex, personaNpub, personaPub, isDefault })
    addLogEntry({
      kind: 0, subject: personaPub, anonymous: false,
      timestamp: Math.floor(Date.now() / 1000),
      description: `${isDefault ? 'Default' : 'Fresh'} nsec-tree identity. Master: ${masterNpub.slice(0, 16)}... Persona: ${personaPub.slice(0, 12)}...`,
    })
    addLogEntry({ kind: 0, subject: '', anonymous: false, timestamp: Math.floor(Date.now() / 1000), separator: 'THE CIRCLE' })
  }

  const handleDefault = () => {
    activate(DEMO.nsec, DEMO.masterNpub, DEMO.masterHex, DEMO.personaPriv, DEMO.personaPub, DEMO.personaNpub, true)
  }

  const handleFresh = () => {
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const root = fromNsec(secret)
    const persona = derive(root, 'persona/veil-demo-journalist', 0)
    const privHex = bytesToHex(persona.privateKey)
    const pubHex = bytesToHex(persona.publicKey)
    const masterHex = String(nip19.decode(root.masterPubkey).data)
    activate(
      nip19.nsecEncode(secret),
      root.masterPubkey,
      masterHex,
      privHex, pubHex,
      nip19.npubEncode(pubHex),
      false,
    )
    root.destroy()
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {identity ? (
        <IdentityPanel identity={identity} onContinue={() => flow.next()} onSwitch={identity.isDefault ? handleFresh : handleDefault} />
      ) : (
        <ModeSelect
          barkDetected={barkDetected}
          onHeartwood={handleHeartwood}
          onDemo={handleDefault}
        />
      )}
    </div>
  )
}

// ─── identity panel (shown after selection) ──────────────────────────────────

function IdentityPanel({ identity, onContinue, onSwitch }: {
  identity: DemoIdentity
  onContinue: () => void
  onSwitch: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: '#4ade80', letterSpacing: '0.15em', fontWeight: 500 }}>
          {identity.isDefault ? 'DEFAULT DEMO IDENTITY' : 'FRESH IDENTITY'}
        </div>
        <button
          onClick={onSwitch}
          style={{
            background: 'none', border: '1px solid #374151', color: '#6b7280',
            padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.68rem',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em',
          }}
        >
          {identity.isDefault ? 'USE FRESH KEY' : 'USE DEFAULT'}
        </button>
      </div>

      {identity.isDefault && (
        <p style={{ color: '#c0c0c0', fontSize: '1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          This is the shared demo identity. Events from every session accumulate on
          the relay, so you can <strong style={{ color: '#e0e0e0' }}>copy the commands below and run them now</strong>.
        </p>
      )}

      {!identity.isDefault && (
        <p style={{ color: '#c0c0c0', fontSize: '1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          A fresh <strong style={{ color: '#e0e0e0' }}>nsec-tree</strong> identity was created for this session.
          Events will be published to the relay as you progress through the demo.
        </p>
      )}

      {/* Derivation diagram */}
      <div style={{
        background: '#0a0a12', border: '1px solid #1a1a2e',
        padding: '1rem 1.2rem', marginBottom: '1rem', fontSize: '0.78rem',
      }}>
        <div style={{ fontSize: '0.68rem', color: '#4b5563', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>
          NSEC-TREE DERIVATION
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <KeyRow label="master" value={identity.masterNpub} colour="#9ca3af" hex={identity.masterHex} />
          <KeyRow label="&#x2514; persona" value={identity.personaNpub} colour="#7b68ee" hex={identity.personaPub} />
        </div>
        <div style={{ fontSize: '0.72rem', color: '#374151', marginTop: '0.6rem' }}>
          path: veil-demo-journalist / 0
        </div>
      </div>

      {/* CLI commands — only for default identity (guaranteed events on relay) */}
      {identity.isDefault && (
        <>
          {/* nostr-bray commands */}
          <div style={{
            background: '#0a0a12', border: '1px solid #1a1a2e',
            padding: '1rem 1.2rem', marginBottom: '0.6rem',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
            lineHeight: 1.9, overflowX: 'auto',
          }}>
            <div style={{ fontSize: '0.68rem', color: '#7b68ee', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
              NOSTR-BRAY
            </div>

            <div style={{ color: '#6b7280' }}># Show raw Nostr identity (schnorr pubkey from the nsec)</div>
            <Cmd>npx nostr-bray --key {DEMO.nsec} whoami</Cmd>
            <Spacer />

            <div style={{ color: '#6b7280' }}># Derive the journalist persona (nsec-tree derivation)</div>
            <Cmd>npx nostr-bray --key {DEMO.nsec} persona "veil-demo-journalist"</Cmd>
          </div>

          {/* nak verification commands */}
          <div style={{
            background: '#0a0a12', border: '1px solid #1a1a2e',
            padding: '1rem 1.2rem', marginBottom: '1rem',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem',
            lineHeight: 1.9, overflowX: 'auto',
          }}>
            <div style={{ fontSize: '0.68rem', color: '#4b5563', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
              VERIFY WITH NAK
            </div>

            <div style={{ color: '#6b7280' }}># Decode the demo nsec</div>
            <Cmd>nak decode {DEMO.nsec}</Cmd>
            <Spacer />

            <div style={{ color: '#6b7280' }}># Fetch events signed by this persona</div>
            <Cmd>nak req -a {DEMO.personaPub} -l 5 wss://relay.trotters.cc</Cmd>
            <Spacer />

            <div style={{ color: '#6b7280' }}># Verify all signatures</div>
            <Cmd>nak req -a {DEMO.personaPub} wss://relay.trotters.cc | nak verify</Cmd>
            <Spacer />

            <div style={{ color: '#6b7280' }}># Fetch the ring assertion (kind 30382)</div>
            <Cmd>nak req -k 30382 -a {DEMO.personaPub} -l 1 wss://relay.trotters.cc</Cmd>
          </div>
        </>
      )}

      {/* nsec card */}
      <div style={{
        padding: '0.8rem', marginBottom: '0.6rem',
        background: 'rgba(250, 204, 21, 0.04)', border: '1px solid rgba(250, 204, 21, 0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <div style={{ fontSize: '0.68rem', color: '#facc15', letterSpacing: '0.1em' }}>
            MASTER NSEC
          </div>
          <CopyButton value={identity.nsec} />
        </div>
        <div style={{
          fontSize: '0.75rem', color: '#facc15', fontFamily: 'monospace',
          wordBreak: 'break-all', lineHeight: 1.5, opacity: 0.8,
        }}>
          {identity.nsec}
        </div>
      </div>

      <p style={{ color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
        The persona key signs events and participates in the trust circle.
        The master key stays hidden until you choose to disclose.
      </p>

      <button
        onClick={onContinue}
        style={{
          padding: '0.7rem 2rem', background: '#7b68ee', border: '1px solid #7b68ee',
          color: '#08080d', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
          cursor: 'pointer', letterSpacing: '0.08em',
        }}
      >
        CONTINUE
      </button>
    </div>
  )
}

// ─── mode select (initial view) ──────────────────────────────────────────────

function ModeSelect({ barkDetected, onHeartwood, onDemo }: {
  barkDetected: boolean | null
  onHeartwood: () => void
  onDemo: () => void
}) {
  return (
    <>
      <p style={{ color: '#c0c0c0', fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.7 }}>
        This demo walks through how <strong style={{ color: '#e0e0e0' }}>nostr-veil</strong> enables
        anonymous trust scoring on Nostr using LSAG ring signatures
        and <strong style={{ color: '#e0e0e0' }}>nsec-tree</strong> identity derivation.
      </p>
      <p style={{ color: '#9ca3af', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
        You'll form a trust circle, score a source, watch scores aggregate anonymously
        via ring signatures, verify the proof, and optionally disclose your identity.
      </p>

      {/* Trust Trilemma: three properties, clearest framing */}
      <div style={{
        marginBottom: '1.2rem', padding: '1rem 1.2rem',
        background: '#0a0a12', border: '1px solid #1a1a2e',
      }}>
        <div style={{ fontSize: '0.68rem', color: '#7b68ee', letterSpacing: '0.15em', marginBottom: '0.8rem', fontWeight: 500 }}>
          THE TRUST TRILEMMA
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto',
          gap: '0.4rem 1.2rem', fontSize: '0.8rem', alignItems: 'center',
        }}>
          <span style={{ color: '#6b7280', fontSize: '0.7rem', letterSpacing: '0.08em' }}></span>
          <span style={{ color: '#6b7280', fontSize: '0.7rem', letterSpacing: '0.08em', textAlign: 'center' }}>NIP-85</span>
          <span style={{ color: '#6b7280', fontSize: '0.7rem', letterSpacing: '0.08em', textAlign: 'center' }}>+ VEIL</span>

          <span style={{ color: '#c0c0c0' }}>Verifiable</span>
          <span style={{ color: '#4ade80', textAlign: 'center' }}>✓</span>
          <span style={{ color: '#4ade80', textAlign: 'center' }}>✓</span>

          <span style={{ color: '#c0c0c0' }}>Portable</span>
          <span style={{ color: '#4ade80', textAlign: 'center' }}>✓</span>
          <span style={{ color: '#4ade80', textAlign: 'center' }}>✓</span>

          <span style={{ color: '#c0c0c0' }}>Private contributor</span>
          <span style={{ color: '#6b7280', textAlign: 'center' }}>·</span>
          <span style={{ color: '#4ade80', textAlign: 'center' }}>✓</span>
        </div>
        <p style={{ marginTop: '0.8rem', fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5 }}>
          Veil events are standard NIP-85. Any Nostr client reads them today. Privacy-aware
          clients additionally verify the ring proof.
        </p>
      </div>

      {/* How Veil fits in the stack: scope is deliberate, adjacent tools handle the rest */}
      <details style={{
        marginBottom: '2rem', padding: '0.6rem 1rem',
        background: '#0a0a12', border: '1px solid #1a1a2e',
      }}>
        <summary style={{
          cursor: 'pointer', color: '#9ca3af',
          fontSize: '0.68rem', letterSpacing: '0.15em', fontWeight: 500,
          padding: '0.4rem 0',
        }}>
          HOW VEIL FITS IN THE STACK
        </summary>
        <div style={{ marginTop: '0.8rem', fontSize: '0.82rem', color: '#c0c0c0', lineHeight: 1.7 }}>
          <p style={{ marginBottom: '0.8rem' }}>
            Veil does one thing cleanly: hides which member of a known circle contributed
            a given score. LSAG signatures make the contribution unlinkable to the signer
            while remaining verifiable. Key images prevent one member signing twice.
          </p>
          <p style={{ marginBottom: '0.8rem', color: '#9ca3af' }}>
            The adjacent problems are handled by sibling libraries already published in
            the ForgeSworn stack:
          </p>
          <p style={{ marginBottom: '0.8rem' }}>
            <strong style={{ color: '#7b68ee' }}>Member vetting</strong> uses NIP-85
            reputation scores and the social ritual that fits the context (legal aid
            onboarding, newsroom security ceremony). The same scores that feed Veil feed
            the vetting.
          </p>
          <p style={{ marginBottom: '0.8rem' }}>
            <strong style={{ color: '#7b68ee' }}>Sybil resistance</strong> at membership
            time comes from the Web of Trust layer underneath. Veil assumes membership is
            vetted; NIP-85 follower graphs, nsec-tree identity derivation, and signet
            handle the vetting.
          </p>
          <p>
            <strong style={{ color: '#7b68ee' }}>Backward compatibility</strong> is a
            design feature, not a limitation. Unaware clients display Veil events as
            standard NIP-85 and ignore the ring proof, so the extension rolls out without
            ecosystem coordination.
          </p>
        </div>
      </details>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {barkDetected && (
          <div style={{
            padding: '1.5rem',
            background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#10b981', letterSpacing: '0.15em', marginBottom: '0.8rem', fontWeight: 500 }}>
              HARDWARE SIGNER DETECTED
            </div>
            <p style={{ color: '#c0c0c0', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              Bark is connected. The demo will use your Heartwood for on-device persona
              derivation, event signing, and relay publishing.
            </p>
            <button onClick={onHeartwood} style={buttonStyle('#10b981')}>
              CONNECT HEARTWOOD
            </button>
          </div>
        )}

        <div style={{
          padding: '1.5rem',
          background: barkDetected ? '#0d0d14' : 'rgba(123, 104, 238, 0.05)',
          border: barkDetected ? '1px solid #1a1a2e' : '1px solid rgba(123, 104, 238, 0.25)',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#7b68ee', letterSpacing: '0.15em', marginBottom: '0.8rem', fontWeight: 500 }}>
            {barkDetected ? 'OR: DEMO MODE' : 'DEMO MODE'}
          </div>
          <p style={{ color: '#c0c0c0', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '0.5rem' }}>
            Uses a shared <strong style={{ color: '#e0e0e0' }}>nsec-tree</strong> demo identity.
            Events are signed with real keys and published to the relay.
            You can verify them independently with{' '}
            <a href="https://github.com/fiatjaf/nak" target="_blank" rel="noreferrer"
              style={{ color: '#7b68ee', textDecoration: 'none' }}>nak</a>.
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1rem' }}>
            You can switch to a fresh random identity after selection.
          </p>
          <button onClick={onDemo} style={buttonStyle('#7b68ee')}>
            START DEMO
          </button>
        </div>

        {barkDetected === null && (
          <div style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
            Checking for hardware signer...
          </div>
        )}
      </div>
    </>
  )
}

// ─── small components ────────────────────────────────────────────────────────

function KeyRow({ label, value, colour, hex }: { label: string; value: string; colour: string; hex: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ color: colour, width: 70, flexShrink: 0, fontSize: '0.72rem' }}>{label}</span>
        <span style={{ color: colour, fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all', flex: 1 }}>
          {value}
        </span>
        <CopyButton value={value} />
      </div>
      <div style={{ paddingLeft: 76, fontSize: '0.65rem', color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {hex}
      </div>
    </div>
  )
}

function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <span style={{ color: '#9ca3af' }}>$ </span>
      <span style={{ color: '#e0e0e0' }}>{children}</span>
    </div>
  )
}

function Spacer() {
  return <div style={{ height: '0.5rem' }} />
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      style={{
        background: copied ? 'rgba(74, 222, 128, 0.1)' : 'none',
        border: copied ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid #374151',
        color: copied ? '#4ade80' : '#6b7280',
        padding: '0.15rem 0.5rem', cursor: 'pointer', fontSize: '0.65rem',
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', flexShrink: 0,
      }}
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}

function buttonStyle(colour: string): React.CSSProperties {
  return {
    padding: '0.7rem 2rem', background: colour, border: `1px solid ${colour}`,
    color: '#08080d', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
    cursor: 'pointer', letterSpacing: '0.08em',
  }
}
