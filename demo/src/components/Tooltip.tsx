import { useState, useRef, useCallback, type ReactNode } from 'react'

const GLOSSARY: Record<string, string> = {
  'NIP-85': 'Nostr Implementation Possibility 85. A spec for publishing trust assertions about users, events, and identifiers on Nostr relays.',
  'LSAG': 'Linkable Spontaneous Anonymous Group signature. Proves you are a member of a group without revealing which member you are. "Linkable" means the same signer can be detected if they sign twice.',
  'ring signature': 'A cryptographic signature that proves the signer belongs to a group (the "ring") without revealing which member signed. Anyone can verify the signature came from the ring, but not who.',
  'trust circle': 'A group of identities who collectively vouch for a subject. Each member signs anonymously via LSAG. The group\'s endorsement is verifiable, but individual votes are private.',
  'ring endorsement': 'An anonymous endorsement backed by LSAG ring signatures from a trust circle. Verifiably from circle members, but no one can tell which member contributed what score.',
  'key image': 'A unique cryptographic fingerprint derived from the signer\'s private key. It prevents double-signing; if someone tries to endorse twice, the duplicate key image is detected.',
  'veil-ring': 'A Nostr event tag containing the public keys of trust circle members. Identifies the ring used for anonymous endorsement.',
  'veil-sig': 'A Nostr event tag containing an LSAG signature and its key image. One per anonymous contribution.',
  'kind 30382': 'NIP-85 replaceable event for user trust assertions: rank, follower count, zap activity, and other reputation metrics about a Nostr pubkey.',
  'kind 10040': 'NIP-85 provider declaration. Lists which services provide which trust metrics, and where to find them.',
  'nsec-tree': 'Deterministic sub-identity derivation. Generates multiple Nostr identities from a single master key, with cryptographic proofs linking them.',
  'blind proof': 'Proves two identities share a master key without revealing the derivation path. The verifier knows they are linked, but not how. Use case: claiming credit ("I was in that circle") without giving away operational details.',
  'full proof': 'Proves two identities share a master key AND reveals the derivation path. Use case: legal proceedings, journalism awards, or whistleblower protection claims where full transparency is needed.',
  'common ownership': 'Cryptographic proof that two Nostr identities were derived from the same master key, proving they belong to the same person.',
  'duress': 'Coercion detection. When a circle member stops sending heartbeats, the network infers they may be compromised and can isolate their node to protect the rest of the group.',
}

interface TooltipProps {
  term: string
  children?: ReactNode
}

export function Tip({ term, children }: TooltipProps) {
  const [show, setShow] = useState(false)
  const [align, setAlign] = useState<'center' | 'left' | 'right'>('center')
  const ref = useRef<HTMLSpanElement>(null)
  const definition = GLOSSARY[term]
  const display = children ?? term

  const handleEnter = useCallback(() => {
    setShow(true)
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const tipWidth = 340
      if (rect.left < tipWidth / 2 + 16) {
        setAlign('left')
      } else if (window.innerWidth - rect.right < tipWidth / 2 + 16) {
        setAlign('right')
      } else {
        setAlign('center')
      }
    }
  }, [])

  if (!definition) return <span>{display}</span>

  const positionStyle = align === 'left'
    ? { left: 0, transform: 'none' }
    : align === 'right'
      ? { right: 0, transform: 'none' }
      : { left: '50%', transform: 'translateX(-50%)' }

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
          ...positionStyle,
          marginBottom: 8,
          padding: '10px 14px',
          background: '#111827',
          border: '1px solid #374151',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          color: '#e0e0e0',
          width: 340,
          zIndex: 50,
          pointerEvents: 'none',
          fontStyle: 'normal',
          fontWeight: 400,
          letterSpacing: 'normal',
        }}>
          <strong style={{ color: '#7b68ee', display: 'block', marginBottom: 4, fontSize: '0.8rem', letterSpacing: '0.05em' }}>
            {term}
          </strong>
          {definition}
        </span>
      )}
    </span>
  )
}
