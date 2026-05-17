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

## Implementation recipe

1. Decide whether the source can be represented by a Nostr pubkey or needs an
   app-private external identifier.
2. Define what `rank` means: identity confidence, reliability, document trail
   strength, or contact safety.
3. Generate source identifiers so they are stable for the newsroom or
   investigation but do not dox the source.
4. Require proof v2 for kind 30385 identifiers, then verify the expected
   circle, subject, namespace, threshold, and score.
5. Keep editorial evidence, secure contact channels, and publication approval
   outside the nostr-veil proof.

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

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove the source's claim is true. | Pair it with normal editorial verification: documents, independent confirmation, fact-checking, and correction policy. |
| The proof does not prove the source is safe to contact. | Use a separate source-risk review, secure contact plan, and least-knowledge handling for sensitive details. |
| The identifier can accidentally reveal too much. | Use a profile-defined identifier scheme, avoid real names or raw case notes, and document who can map identifiers back to internal records. |
| The proof does not hide timing, relay, or note metadata. | Batch contributions, use private collection channels where needed, and keep operational notes out of public assertions. |

## Policy choices

- What does `rank` mean: identity confidence, reliability, document quality, or
  some combined score?
- How is the source identifier generated so it is stable but not doxxing?
- Who is allowed into the editorial circle?
- How long should a source signal remain valid?
