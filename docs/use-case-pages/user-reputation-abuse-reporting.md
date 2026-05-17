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

## Subject design

- Use this profile only when the action target is a Nostr pubkey.
- Put the same pubkey in `d` and `p`; proof v2 binds the signed contribution to
  that user-assertion subject.
- Do not mix identity confidence, abuse severity, and report volume into one
  undocumented number. If clients need all three, publish separate assertions
  or define a profile that explains the weighting.
- Treat the public `veil-ring` as the reviewer cover set. It should be large
  enough that membership does not identify victims, witnesses, or moderators.

## What to publish

- A kind 30382 assertion created with `aggregateContributions`.
- Metric tags whose direction is documented before collection, usually `rank`
  and optionally `reports_cnt_recd`.
- `veil-ring`, `veil-threshold`, `veil-agg`, `veil-version`, and `veil-sig`
  tags from the aggregator.
- A separate policy page or provider profile that tells clients which circle,
  threshold, evidence standard, expiry, appeal path, and recovery rules apply.

## Implementation recipe

1. Publish the circle admission policy before accepting reports.
2. Define whether `rank` measures trust, risk, confidence, or severity.
3. Batch or delay contribution collection if timing could identify reviewers.
4. Aggregate with proof v2 and publish the resulting kind 30382 event.
5. On the client, require strict syntax, a valid proof, the expected circle ID,
   and a policy threshold before taking action.

## Worked example

<!-- use-case-example: user-reputation-abuse-reporting -->

The output is a kind 30382 event with `d`, `p`, metric tags, and `veil-*` proof
tags. A verifier can see the aggregate score and that distinct circle members
signed it; they cannot see which members signed.

## What to verify

- `validateAssertionStrict(assertion).valid` is true.
- `verifyProof(assertion, { requireProofVersion: 'v2' }).valid` is true.
- The event is kind 30382 and both `d` and `p` equal the user pubkey the client
  is about to act on.
- The `veil-ring` matches an accepted moderation circle, or its computed circle
  ID is in the client's allow-list.
- `proof.distinctSigners` meets the policy threshold, the `rank` direction is
  known, and the assertion is fresh enough for the action being taken.

## What this proves

- The event is syntactically a strict user assertion.
- Each contribution was signed by some member of the published ring.
- The same member did not contribute twice to this circle/scope and subject.
- The metric tags match the aggregate of the signed contributions.
- With proof v2, the proof is bound to kind 30382 and the `p` subject hint.

## What not to claim

- Do not claim the proof proves abuse happened. It proves a threshold-backed
  reviewer signal about the pubkey.
- Do not claim reviewers are invisible to all observers. The public ring shows
  who could have contributed; timing, relay, and collector metadata still need
  operational controls.
- Do not claim the circle is inherently fair or Sybil-resistant. That is a
  governance property of the circle, not a cryptographic property of the proof.

## Failure handling

- Reject malformed proofs, wrong-subject assertions, unknown circles, stale
  events, and scores whose metric direction is not published.
- Route low-score or high-severity outcomes into the moderation process instead
  of treating the score as the whole case file.
- Publish correction or recovery assertions when an account is cleared,
  compromised, restored, or re-reviewed.
- Keep appeal evidence outside the nostr-veil event and link only the public
  decision state that clients need.

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
