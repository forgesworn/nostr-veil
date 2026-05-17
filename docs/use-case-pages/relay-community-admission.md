# Relay or community admission

This is a future profile. nostr-veil can already publish a threshold-backed
vouch assertion about a candidate, but a full anonymous admission system needs a
separate access handshake and transport privacy.

## Fit

- Status: future profile, with a supported vouch assertion today.
- Current NIP-85 shape: kind 30382 user assertion for the candidate pubkey.
- Subject: candidate account pubkey.
- Helpers today: `contributeAssertion`, `aggregateContributions`,
  `verifyProof`.
- Proof version: v2 recommended.
- Useful metric today: `rank` as admission confidence.

## Implementation recipe for today's building block

1. Publish a threshold-backed vouch assertion about the candidate pubkey.
2. Have the relay or community verify the expected circle, threshold, subject,
   and freshness.
3. Apply ordinary access policy based on that verified assertion.
4. Keep transport privacy, account creation, session continuity, revocation, and
   abuse handling outside nostr-veil until a full admission profile exists.

## Worked example for today's building block

```ts
import {
  aggregateContributions,
  contributeAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const candidatePubkey = applicantPubkey
const circle = createTrustCircle(admissionMembers.map(m => m.pubkey))

const contributions = admissionMembers.map((member) =>
  contributeAssertion(
    circle,
    candidatePubkey,
    { rank: member.admissionConfidence },
    member.privateKey,
    circle.members.indexOf(member.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateContributions(
  circle,
  candidatePubkey,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
const canApplyPolicy = syntax.valid && proof.valid && proof.distinctSigners >= 3
```

## What this proves today

- Enough distinct members vouched for the candidate pubkey.
- No individual member is named.
- A relay or community can use the assertion as one policy input.

## What a full admission profile still needs

- A challenge/response handshake for the relay or community.
- Rules for presenting a proof without leaking equivalent metadata.
- Expiry and revocation.
- How the admitted user proves continuity after admission.
- Abuse handling after a vouched user is admitted.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not currently implement anonymous access control. | Add a relay or community challenge/response protocol that accepts a verified threshold assertion. |
| IP address, timing, and relay metadata are outside the proof. | Add transport privacy, batching, careful relay logs, and metadata-minimising admission flows. |
| A user cannot enter a relay without relay policy. | Define policy for accepted circles, threshold, freshness, and what happens after admission. |
| Revocation and ban evasion are separate problems. | Add expiry, revocation, session continuity, abuse response, and re-admission rules. |
