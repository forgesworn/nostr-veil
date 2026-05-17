# Anonymous credential or attestation co-signing

This is a future profile. nostr-veil can already attach an anonymous
threshold-backed score to a credential or attestation event, but it does not yet
define the credential format, endorsement semantics, expiry, revocation, or
presentation rules.

## Fit

- Status: future profile, with a supported building block today.
- Current NIP-85 shape: kind 30383 for an attestation event id, or 30384 for an
  addressable credential record.
- Subject: the credential or attestation event, not the holder in general.
- Helpers today: `contributeEventAssertion` or
  `contributeAddressableAssertion`.
- Proof version: v2 strongly recommended.
- Useful metric today: `rank` as endorsement confidence.

## Implementation recipe for today's building block

1. Publish or identify the credential or attestation event to be scored.
2. Have the attestor circle publish a proof v2 event or addressable assertion
   against that exact subject.
3. Verify the expected subject, circle, threshold, and score before treating the
   attestation as endorsed.
4. Keep holder binding, presentation, selective disclosure, expiry, and
   revocation in the credential profile until nostr-veil has native support for
   those semantics.

## Worked example for today's building block

```ts
import {
  aggregateEventContributions,
  contributeEventAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const attestationEventId = 'cc'.repeat(32)
const circle = createTrustCircle(attestors.map(a => a.pubkey))

const contributions = attestors.map((attestor) =>
  contributeEventAssertion(
    circle,
    attestationEventId,
    { rank: attestor.endorsementConfidence },
    attestor.privateKey,
    circle.members.indexOf(attestor.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateEventContributions(
  circle,
  attestationEventId,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid attestation score')
```

## What this proves today

- A circle scored a specific attestation event.
- Distinct members contributed, without being named.
- The aggregate score is bound to the event id.

## What a full profile still needs

- A credential or attestation event format.
- Holder binding and presentation rules.
- Expiry and revocation semantics.
- Whether endorsements are binary, ranked, weighted, or scoped.
- How a verifier discovers the right circle for the credential class.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not currently issue anonymous credentials. | Define a credential or attestation event format, issuer rules, holder binding, and presentation flow. |
| Selective disclosure is not defined here. | Add a credential protocol that can reveal only the required attributes while keeping the nostr-veil proof as the anonymous endorsement signal. |
| The proof does not prove the credential subject is the presenter. | Add holder-binding keys, challenge/response presentation, and replay protection. |
| Revocation is not defined yet. | Add expiry, revocation events, revocation discovery, and client policy for stale credentials. |
