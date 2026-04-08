import { useState, useRef, useCallback, type ReactNode } from 'react'

interface GlossaryEntry {
  definition: string
  url?: string
  urlLabel?: string
}

const GLOSSARY: Record<string, GlossaryEntry> = {
  'NIP-85': {
    definition: 'Nostr Implementation Possibility 85. A spec for publishing trust assertions about users, events, and identifiers on Nostr relays.',
    url: 'https://github.com/nostr-protocol/nips/blob/master/85.md',
    urlLabel: 'NIP-85 spec',
  },
  'LSAG': {
    definition: 'Linkable Spontaneous Anonymous Group signature. Proves you are a member of a group without revealing which member you are. "Linkable" means the same signer can be detected if they sign twice. Battle-tested in Monero since 2014.',
    url: 'https://github.com/forgesworn/ring-sig',
    urlLabel: '@forgesworn/ring-sig',
  },
  'ring signature': {
    definition: 'A cryptographic signature that proves the signer belongs to a group (the "ring") without revealing which member signed. Anyone can verify the signature came from the ring, but not who.',
    url: 'https://github.com/forgesworn/ring-sig',
    urlLabel: '@forgesworn/ring-sig',
  },
  'trust circle': {
    definition: 'A group of identities who collectively vouch for a subject. Each member signs anonymously via LSAG. The group\'s endorsement is verifiable, but individual votes are private.',
  },
  'ring endorsement': {
    definition: 'An anonymous endorsement backed by LSAG ring signatures from a trust circle. Verifiably from circle members, but no one can tell which member contributed what score.',
  },
  'key image': {
    definition: 'A unique cryptographic fingerprint derived from the signer\'s private key. It prevents double-signing; if someone tries to endorse twice, the duplicate key image is detected. Same mechanism Monero uses to prevent double-spending.',
  },
  'veil-ring': {
    definition: 'A Nostr event tag containing the sorted public keys of trust circle members. Identifies the ring used for anonymous endorsement. NIP-85 clients that don\'t recognise this tag simply ignore it.',
  },
  'veil-sig': {
    definition: 'A Nostr event tag containing an LSAG signature and its key image. One per anonymous contribution. A verifier parses these to confirm each signature is valid and each key image is unique.',
  },
  'veil-threshold': {
    definition: 'A Nostr event tag with two values: how many circle members signed, and the total circle size. Lets a verifier check whether enough members participated for the result to be meaningful.',
  },
  'kind 30382': {
    definition: 'NIP-85 replaceable event for user trust assertions: rank, follower count, zap activity, and other reputation metrics about a Nostr pubkey.',
    url: 'https://github.com/nostr-protocol/nips/blob/master/85.md',
    urlLabel: 'NIP-85 spec',
  },
  'kind 10040': {
    definition: 'NIP-85 provider declaration. Lists which services provide which trust metrics, and where to find them.',
    url: 'https://github.com/nostr-protocol/nips/blob/master/85.md',
    urlLabel: 'NIP-85 spec',
  },
  'NIP-VA': {
    definition: 'Verifiable Attestations for Nostr. A single event kind (31000) for any verifiable claim: identity credentials, peer reviews, safety reports. Collaborative spec work with Nathan Day.',
    url: 'https://github.com/forgesworn/nostr-attestations',
    urlLabel: 'nostr-attestations',
  },
  'nsec-tree': {
    definition: 'Deterministic sub-identity derivation. Generates multiple Nostr identities from a single master key, with cryptographic proofs linking them.',
    url: 'https://github.com/forgesworn/nsec-tree',
    urlLabel: 'forgesworn/nsec-tree',
  },
  'blind proof': {
    definition: 'Proves two identities share a master key without revealing the derivation path. The verifier knows they are linked, but not how.',
  },
  'full proof': {
    definition: 'Proves two identities share a master key AND reveals the derivation path. Use case: legal proceedings, journalism awards, or whistleblower protection claims where full transparency is needed.',
  },
  'common ownership': {
    definition: 'Cryptographic proof that two Nostr identities were derived from the same master key, proving they belong to the same person. Built on nsec-tree deterministic derivation.',
    url: 'https://github.com/forgesworn/nsec-tree',
    urlLabel: 'forgesworn/nsec-tree',
  },
  'duress': {
    definition: 'Coercion detection. When a circle member stops sending heartbeats, the network infers they may be compromised and can isolate their node to protect the rest of the group.',
    url: 'https://github.com/forgesworn/canary-kit',
    urlLabel: 'forgesworn/canary-kit',
  },
  'Heartwood': {
    definition: 'Open-source Nostr signing software for Raspberry Pi and ESP32. Keys never leave the device. Tor by default, NIP-46 remote signing, unlimited personas from one mnemonic.',
    url: 'https://github.com/forgesworn/heartwood',
    urlLabel: 'forgesworn/heartwood',
  },
}

interface TooltipProps {
  term: string
  children?: ReactNode
}

export function Tip({ term, children }: TooltipProps) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ left?: number; right?: number; transform?: string }>({})
  const ref = useRef<HTMLSpanElement>(null)
  const entry = GLOSSARY[term]
  const display = children ?? term

  const handleEnter = useCallback(() => {
    setShow(true)
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const tipWidth = 340
      const margin = 16

      // Calculate optimal horizontal position clamped to viewport
      const centerX = rect.left + rect.width / 2
      let left = centerX - tipWidth / 2

      // Clamp to viewport edges
      if (left < margin) {
        left = margin
      } else if (left + tipWidth > window.innerWidth - margin) {
        left = window.innerWidth - margin - tipWidth
      }

      // Convert to position relative to the parent span
      const parentLeft = rect.left
      setPos({ left: left - parentLeft, transform: 'none' })
    }
  }, [])

  if (!entry) return <span>{display}</span>

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        borderBottom: '1px dotted #7b68ee',
        cursor: 'help',
        color: 'inherit',
      }}>
        {display}
      </span>
      {show && (
        <span style={{
          position: 'absolute',
          bottom: '100%',
          left: pos.left ?? 0,
          transform: pos.transform,
          marginBottom: 8,
          padding: '10px 14px',
          background: '#111827',
          border: '1px solid #374151',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          color: '#e0e0e0',
          width: 340,
          maxWidth: 'calc(100vw - 32px)',
          zIndex: 50,
          pointerEvents: entry.url ? 'auto' : 'none',
          fontStyle: 'normal',
          fontWeight: 400,
          letterSpacing: 'normal',
        }}>
          <strong style={{ color: '#7b68ee', display: 'block', marginBottom: 4, fontSize: '0.8rem', letterSpacing: '0.05em' }}>
            {term}
          </strong>
          {entry.definition}
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: '0.75rem',
                color: '#7b68ee',
                textDecoration: 'none',
                letterSpacing: '0.03em',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none' }}
            >
              {entry.urlLabel ?? entry.url} ↗
            </a>
          )}
        </span>
      )}
    </span>
  )
}
