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

## Subject design

- Use kind 30384 when the reviewed artefact is addressable by
  `kind:pubkey:d-tag`.
- Decide whether the subject is a fixed revision, a living article, a proposal
  record, or a review docket. That decision controls expiry and supersession.
- Keep author reputation separate from artefact quality unless the profile says
  the score intentionally combines them.
- Use a new address or a clear revision policy when material changes alter what
  reviewers actually evaluated.

## What to publish

- A kind 30384 assertion created with `aggregateAddressableContributions`.
- A documented `rank` meaning: review quality, technical confidence, relevance,
  safety, acceptance likelihood, or another venue-specific score.
- Optional count metrics such as `comment_cnt` only when they correspond to
  defined review activity.
- Separate review notes, conflict declarations, datasets, replication logs, and
  correction records when readers need explanation beyond the aggregate.

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

<!-- use-case-example: article-research-review -->

## What to verify

- Strict syntax and a valid proof v2.
- Kind 30384, with `d` and `a` equal to the addressable artefact under review.
- The reviewer ring is approved for this venue, subject area, or funding
  programme.
- The score has enough distinct signers and uses the venue's documented metric
  direction.
- The assertion is still valid for the current revision or has a clear
  supersession path.

## What this proves

- The review signal is tied to a specific addressable event, not merely to the
  author.
- Distinct circle members contributed the signed metrics.
- The aggregate can be recomputed by anyone.

## What not to claim

- Do not claim the proof proves the research is correct. It proves a reviewer
  circle's aggregate assessment.
- Do not claim hidden reviewers supplied no conflicts. Conflict declarations and
  recusal rules sit outside the proof.
- Do not claim a score survives material revisions unless the profile treats the
  address as a living record and defines expiry.

## Failure handling

- Reject assertions for the wrong address, untrusted circles, unknown metric
  meanings, or insufficient signer counts.
- When an artefact changes, either publish a new assertion for the revised
  address or mark the older score as stale in the client.
- Handle contested reviews with a companion rationale, appeal process, or
  independent second circle.
- Keep private reviewer notes outside the public assertion and publish redacted
  summaries only when the venue requires them.

## Operational requirements

| Risk to handle | Required control |
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
