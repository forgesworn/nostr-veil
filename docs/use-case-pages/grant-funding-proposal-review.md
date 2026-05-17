# Grant, funding, and proposal review

Use this when reviewers score proposals, grants, milestones, maintainers, or
deliverables and need protection from pressure by applicants, sponsors, or
communities.

## Fit

- Status: supported today.
- NIP-85 kind: 30383 for a proposal event, or 30384 for an addressable proposal
  record.
- Subject: proposal event id or NIP-33 address.
- Helpers: `aggregateEventContributions` or
  `aggregateAddressableContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank` as review score, confidence, or funding priority.

## Subject design

- Use kind 30383 when the proposal is a single immutable event.
- Use kind 30384 when the proposal, milestone, or deliverable is an addressable
  record that can be referenced by `kind:pubkey:d-tag`.
- Score maintainers, proposals, milestones, and deliverables separately when
  the fund may take different actions on each.
- Decide whether revisions inherit review scores. Funding workflows usually
  need explicit supersession when applicants materially change a proposal.

## What to publish

- A kind 30383 or 30384 assertion matching the proposal subject.
- A `rank` profile explaining whether the score represents eligibility,
  technical confidence, impact, delivery risk, final funding priority, or a
  veto signal.
- Proof v2 tags from the reviewer circle, plus threshold, conflict rules,
  expiry, appeal path, and whether the score is advisory or automatic.
- Companion records for reviewer rationale, redacted comments, milestone
  evidence, conflict declarations, and final award decisions.

## Implementation recipe

1. Decide whether the subject is a proposal event, an addressable proposal
   record, a milestone, or a maintainer.
2. Define whether `rank` means eligibility, technical confidence, impact,
   delivery risk, or final funding priority.
3. Use proof v2 and verify the expected proposal subject, circle, threshold,
   and freshness.
4. Keep reviewer comments, conflict declarations, and appeals in a companion
   grant process.
5. Treat the aggregate as an auditable review signal unless the fund explicitly
   chooses automatic decisions.

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
const proposalAddress = `30023:${applicantPubkey}:grant-2026-q2`
const circle = createTrustCircle(grantReviewers.map(r => r.pubkey))

const contributions = grantReviewers.map((reviewer) =>
  contributeAddressableAssertion(
    circle,
    proposalAddress,
    { rank: reviewer.fundingRank },
    reviewer.privateKey,
    circle.members.indexOf(reviewer.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateAddressableContributions(
  circle,
  proposalAddress,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid proposal assertion')
```

## What to verify

- Strict syntax and a valid proof v2.
- The assertion kind and subject tag match the proposal or milestone currently
  being evaluated.
- The reviewer circle is approved for this fund, topic, and conflict policy.
- `proof.distinctSigners` meets the funding threshold and the `rank` meaning is
  known before ranking proposals.
- The score is current for the proposal revision and not superseded by appeals,
  conflicts, or milestone evidence.

## What this proves

- Distinct grant reviewers contributed the aggregate score.
- The score is bound to a specific proposal subject.
- The reviewer set is public, but individual reviewers are not named.

## What not to claim

- Do not claim the proof predicts delivery or guarantees impact.
- Do not claim hidden reviewers had no conflicts; conflict declarations and
  recusals must be enforced by the grant process.
- Do not claim a score is a fair final decision unless the fund has explicitly
  published that policy.

## Failure handling

- Reject wrong-subject assertions, stale proposal scores, unknown reviewer
  circles, and scores without a published meaning.
- Pause automatic ranking when conflict reports, appeals, or material proposal
  revisions appear.
- Publish a new assertion for revised proposals or milestone outcomes instead
  of reinterpreting an older review.
- Show final decision notes separately so applicants know what to fix even when
  reviewer identities remain protected.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove the proposal will succeed. | Use milestone tracking, deliverable checks, and post-award review to validate execution. |
| The proof does not show private reviewer rationale. | Publish redacted rationale, criteria scores, or decision notes when transparency is required. |
| Conflicts of interest are not eliminated by the proof. | Require conflict declarations, recusals, reviewer eligibility rules, and independent review circles for large awards. |
| A score alone may not be a fair decision. | Define whether the score is advisory, a ranking input, a veto, or an automatic threshold. |

## Policy choices

- Does `rank` mean funding priority, technical confidence, impact, or
  eligibility?
- Should the circle include domain experts, funders, community members, or all
  three?
- Is the final decision automatic or advisory?
- How are appeals and corrections handled?
