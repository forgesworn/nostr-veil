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

## Implementation recipe

1. Publish the circle admission policy before accepting reports.
2. Define whether `rank` measures trust, risk, confidence, or severity.
3. Batch or delay contribution collection if timing could identify reviewers.
4. Aggregate with proof v2 and publish the resulting kind 30382 event.
5. On the client, require strict syntax, a valid proof, the expected circle ID,
   and a policy threshold before taking action.

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

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove that abuse happened. | Keep a separate evidence workflow, retention policy, escalation path, and appeal process. Use the nostr-veil score as the anonymous threshold signal, not as the whole case file. |
| The proof does not prove the circle is fair, independent, or Sybil-resistant. | Publish admission criteria, rotate compromised members, use independent circles for high-impact actions, and audit circle membership changes. |
| The public ring reveals who could have contributed. | Use a cover set large enough for the risk, avoid circles made only of vulnerable reporters, and separate "reviewer circle" membership from "victim or witness" identity. |
| Network, timing, or collector metadata can still leak. | Batch collection, avoid one-to-one submission timing, use transport privacy where appropriate, and avoid logging contributor IPs or relay metadata. |

## Policy choices

- Who can join the moderation or trust circle?
- How are false reports handled?
- Does a low score expire or recover over time?
- What threshold is enough for client action?
- Who signs and publishes the final aggregate event?
