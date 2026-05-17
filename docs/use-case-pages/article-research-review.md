# Article, research, and long-form review

Use this for addressable Nostr objects: long-form notes, research artefacts,
grant applications, proposals, and other NIP-33-style records.

## Fit

- Status: supported today.
- NIP-85 kind: 30384 addressable assertion.
- Subject: NIP-33 address in both `d` and `a`, formatted as
  `kind:pubkey:d-tag`.
- Helpers: `contributeAddressableAssertion`,
  `aggregateAddressableContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank`, `comment_cnt`, `quote_cnt`, `repost_cnt`,
  `reaction_cnt`, `zap_cnt`, `zap_amount`.

## Implementation recipe

1. Decide whether the scored object is the work as a whole, a specific
   revision, or the author's standing.
2. Define what `rank` means for this venue: quality, confidence, relevance,
   safety, or acceptance likelihood.
3. Use a stable NIP-33 address for the artefact and proof v2 for new
   deployments.
4. Verify the expected address, circle, threshold, and freshness before showing
   the score as review guidance.
5. Publish comments, review criteria, and conflict handling separately if the
   venue needs them.

## Worked example

```ts
import {
  aggregateAddressableContributions,
  contributeAddressableAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const articleAddress = `30023:${authorPubkey}:paper-2026-05`
const circle = createTrustCircle(reviewers.map(r => r.pubkey))

const contributions = reviewers.map((reviewer) =>
  contributeAddressableAssertion(
    circle,
    articleAddress,
    {
      rank: reviewer.reviewScore,
      comment_cnt: reviewer.substantiveComments,
    },
    reviewer.privateKey,
    circle.members.indexOf(reviewer.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateAddressableContributions(
  circle,
  articleAddress,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid review assertion')
```

## What this proves

- The review signal is tied to a specific addressable event, not merely to the
  author.
- Distinct circle members contributed the signed metrics.
- The aggregate can be recomputed by anyone.

## Boundary and companion controls

| Boundary | Add this to cover it |
| --- | --- |
| The proof does not prove the research is correct. | Pair it with review criteria, reproducibility artefacts, open data where possible, and correction policy. |
| The proof does not reveal reviewer comments. | Publish redacted review notes, structured comments, or reviewer rationale events when the workflow needs explanations. |
| Conflicts of interest are not solved by cryptography. | Define reviewer eligibility, conflict declarations, recusal rules, and circle rotation outside the proof. |
| Revisions can change the artefact being reviewed. | Score exact revisions when precision matters, or document that the address represents a living record with expiry. |

## Policy choices

- Which addressable kind represents the artefact in your profile?
- Is `rank` quality, confidence, relevance, safety, or acceptance likelihood?
- Does the score expire when the artefact is revised?
- Should each revision use a new `d` tag or reuse the same address?
