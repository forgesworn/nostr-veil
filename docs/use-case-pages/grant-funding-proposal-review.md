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

## What this proves

- Distinct grant reviewers contributed the aggregate score.
- The score is bound to a specific proposal subject.
- The reviewer set is public, but individual reviewers are not named.

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
