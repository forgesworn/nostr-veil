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

## What not to claim yet

- nostr-veil does not currently issue anonymous credentials.
- It does not define selective disclosure.
- It does not prove the credential subject is the presenter.
- It does not define revocation.
