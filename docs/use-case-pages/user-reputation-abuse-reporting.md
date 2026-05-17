# User reputation and abuse reporting

Use this when the subject is a Nostr account and the circle wants to publish a
trust or abuse-risk signal without exposing which members contributed.

## Fit

- Status: supported today.
- NIP-85 kind: 30382 user assertion.
- Subject: account pubkey in the `d` tag, optionally mirrored in `p`.
- Helpers: `contributeAssertion`, `aggregateContributions`.
- Proof version: v2 recommended for new deployments, v1 remains compatible.
- Useful metrics: `rank`, `reports_cnt_recd`, `reports_cnt_sent`, and other
  supported user metrics.

Define metric direction before publishing. A practical profile is:

- high `rank`: trusted or low risk;
- low `rank`: low trust or higher concern;
- `reports_cnt_recd`: number of report-like contributions represented by the
  anonymous reviewers.

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
const circle = createTrustCircle(reviewers.map(r => r.pubkey))
const subjectPubkey = accusedOrRatedUserPubkey

const contributions = reviewers.map((reviewer) =>
  contributeAssertion(
    circle,
    subjectPubkey,
    {
      rank: reviewer.trustRank,
      reports_cnt_recd: reviewer.reportCount,
    },
    reviewer.privateKey,
    circle.members.indexOf(reviewer.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateContributions(
  circle,
  subjectPubkey,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })

if (!syntax.valid || !proof.valid) {
  throw new Error([...syntax.errors, ...proof.errors].join('; '))
}
```

The output is a kind 30382 event with `d`, `p`, metric tags, and `veil-*` proof
tags. A verifier can see the aggregate score and that distinct circle members
signed it; they cannot see which members signed.

## What this proves

- The event is syntactically a strict user assertion.
- Each contribution was signed by some member of the published ring.
- The same member did not contribute twice to this circle/scope and subject.
- The metric tags match the aggregate of the signed contributions.
- With proof v2, the proof is bound to kind 30382 and the `p` subject hint.

## What not to claim

- It does not prove that abuse happened.
- It does not prove the circle is fair, independent, or Sybil-resistant.
- It does not hide the public circle membership list.
- It does not hide network or timing metadata from the collection workflow.

## Policy choices

- Who can join the moderation or trust circle?
- How are false reports handled?
- Does a low score expire or recover over time?
- What threshold is enough for client action?
- Who signs and publishes the final aggregate event?
