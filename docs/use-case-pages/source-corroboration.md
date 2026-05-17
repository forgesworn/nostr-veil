# Source corroboration

Use this when an editorial, research, or investigation circle wants to say that
enough trusted people have prior knowledge of a source or document trail,
without recording which people vouched.

## Fit

- Status: supported today.
- NIP-85 kind: 30382 when the source has a Nostr pubkey; 30385 when the source
  is tracked by an external identifier.
- Subject: source pubkey, or an agreed identifier such as
  `source:newsroom-a:case-2026-05`.
- Helpers: `aggregateContributions` for pubkeys,
  `aggregateIdentifierContributions` for external identifiers.
- Proof version: v2 recommended for identifier subjects.
- Useful metrics: `rank` as source confidence, reliability, or corroboration
  strength.

## Worked example

This example uses an app-private identifier namespace. The `k` value `0` is a
profile choice for this application, not a Nostr-wide registry.

```ts
import {
  aggregateIdentifierContributions,
  contributeIdentifierAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const sourceProfileKind = '0'
const sourceId = 'source:newsroom-a:case-2026-05'
const circle = createTrustCircle(editorsAndContacts.map(m => m.pubkey))

const contributions = editorsAndContacts.map((member) =>
  contributeIdentifierAssertion(
    circle,
    sourceId,
    sourceProfileKind,
    { rank: member.confidence },
    member.privateKey,
    circle.members.indexOf(member.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateIdentifierContributions(
  circle,
  sourceId,
  sourceProfileKind,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid source assertion')
```

## What this proves

- The signed metrics came from distinct members of the published circle.
- The aggregate `rank` matches the signed confidence values.
- With proof v2, the proof is bound to kind 30385 and the `k` profile tag.

## What not to claim

- It does not prove the source's claim is true.
- It does not prove the source is safe to contact.
- It does not protect operational security outside the proof, such as message
  timing, relay metadata, or leaked notes.

## Policy choices

- What does `rank` mean: identity confidence, reliability, document quality, or
  some combined score?
- How is the source identifier generated so it is stable but not doxxing?
- Who is allowed into the editorial circle?
- How long should a source signal remain valid?
