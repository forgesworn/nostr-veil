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

## Subject design

- Use the candidate pubkey as the subject when the vouch should be portable
  across clients or communities.
- Put the candidate pubkey in both `d` and `p`; proof v2 binds the vouch to that
  candidate, not to a future session or account-creation flow.
- Keep onboarding vouches separate from later behaviour scores. A good
  admission signal should not permanently override moderation outcomes.
- If the candidate pubkey itself must stay private, this profile is not enough;
  use the future admission profile with a separate presentation handshake.

## What to publish

- A kind 30382 assertion created with `aggregateContributions`.
- A `rank` value with a clear meaning such as admission confidence, community
  fit, or verified-sponsor confidence.
- Proof v2 tags and a public policy for accepted circles, minimum threshold,
  expiry, revocation, and re-review.
- No private application notes or onboarding evidence in the assertion content;
  keep those in the community's internal workflow.

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

## What to verify

- Strict NIP-85 syntax and a valid proof v2.
- Kind 30382, with `d` and `p` equal to the candidate pubkey being considered.
- The `veil-ring` belongs to an accepted admission circle and
  `proof.distinctSigners` meets the community threshold.
- The `rank` meaning matches the community's onboarding policy.
- The assertion is not expired or superseded by a revocation, ban, or later
  re-review.

## What this proves

- Enough distinct circle members vouched for the candidate.
- The candidate subject is bound to the proof.
- No individual vouching member is identified.

## What not to claim

- Do not claim the user was admitted anonymously. The candidate pubkey is public
  in the assertion.
- Do not claim the assertion grants relay access by itself. A relay or community
  still needs policy code that accepts or rejects the verified vouch.
- Do not claim a vouch predicts future behaviour. It is an admission signal at
  a point in time.

## Failure handling

- Reject vouches from unknown circles, below-threshold circles, expired
  assertions, or assertions about the wrong pubkey.
- Expire onboarding vouches by default and require re-review for sensitive
  communities.
- Publish a revocation or updated assertion when a sponsor withdraws support or
  the candidate later violates policy.
- Fall back to manual review when independent circles disagree.

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
