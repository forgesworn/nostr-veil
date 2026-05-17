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

## What not to claim

- It does not admit the user to a relay by itself.
- It does not hide the candidate pubkey.
- It does not prevent the candidate from later misbehaving.

## Policy choices

- What threshold is enough to join?
- Should onboarding vouches expire?
- Can a vouch be revoked later?
- Does the candidate need multiple independent circles?
