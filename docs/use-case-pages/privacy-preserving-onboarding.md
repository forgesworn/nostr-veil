# Privacy-preserving onboarding

Use this when an existing circle wants to vouch that a new account passed an
admission or onboarding policy without naming which members vouched.

## Fit

- Status: supported today as a vouch assertion.
- NIP-85 kind: 30382 user assertion.
- Subject: candidate account pubkey.
- Helpers: `contributeAssertion`, `aggregateContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank` as admission confidence or community standing.

This is not anonymous gated access by itself. It creates a verifiable vouch
event that another client, relay, or community can use as an input to policy.

## Implementation recipe

1. Define the admission policy and the threshold needed before a vouch is
   useful.
2. Publish a kind 30382 assertion about the candidate pubkey with proof v2.
3. Verify the expected circle, threshold, candidate subject, and score before
   applying community policy.
4. Add expiry and revocation policy so old vouches do not become permanent
   social credentials.
5. For anonymous gated access, pair this with the future admission handshake
   described in [relay or community admission](./relay-community-admission.md).

## Worked example

```ts
import {
  aggregateContributions,
  contributeAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const candidatePubkey = newMemberPubkey
const circle = createTrustCircle(existingMembers.map(m => m.pubkey))

const contributions = existingMembers.map((member) =>
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
const accepted = syntax.valid && proof.valid && proof.distinctSigners >= 3
```

## What this proves

- Enough distinct circle members vouched for the candidate.
- The candidate subject is bound to the proof.
- No individual vouching member is identified.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The assertion does not admit the user to a relay by itself. | Implement relay or community policy that checks the assertion and then grants access. |
| The candidate pubkey is visible. | Use this for portable vouching today. For private membership or unlinkable entry, add a separate anonymous admission protocol. |
| The proof does not prevent later misbehaviour. | Add expiry, re-review, revocation, moderation policy, and post-admission enforcement. |
| A single circle may be captured or too local. | Require multiple independent circles or a scoped federation for higher-risk communities. |

## Policy choices

- What threshold is enough to join?
- Should onboarding vouches expire?
- Can a vouch be revoked later?
- Does the candidate need multiple independent circles?
