# Federated moderation

Use this when several trust circles assess the same subject and the verifier
needs to count distinct contributors across circles without double-counting
members who appear in more than one circle.

## Fit

- Status: supported today.
- NIP-85 kind: any supported assertion kind, as long as all events agree on the
  same subject and `scope`.
- Subject: usually a user pubkey or event id.
- Helpers: `createTrustCircle(members, { scope })`, aggregate normally, then
  `verifyFederation`.
- Scope format: lowercase slug using letters, digits, dot, hyphen, or
  underscore.
- Proof version: v2 recommended.

## Subject design

- Use federation when several circles score the same subject and a verifier
  must deduplicate contributors who are members of more than one circle.
- Create each circle with the same `scope` before collecting contributions.
  Scoped key images are what make cross-circle deduplication possible.
- Keep the subject route identical across events. Do not federate a user
  assertion with an event assertion or an identifier assertion.
- Use unscoped circles when overlap privacy matters more than deduplication.

## What to publish

- One normal nostr-veil assertion per circle, all for the same subject and
  assertion kind.
- A shared `veil-scope` value emitted by circles created with that scope.
- A federation policy explaining participating circles, minimum per-circle
  thresholds, overall distinct-signer threshold, weighting, and disagreement
  handling.
- No attempt to merge raw signatures into one event; verifiers should verify the
  separate events and then call `verifyFederation`.

## Implementation recipe

1. Agree the federation `scope` before any circle publishes assertions.
2. Use the same subject and assertion kind across all participating circles.
3. Verify each event independently, then call `verifyFederation` to count
   scoped key images once.
4. Decide whether every circle must meet its own threshold before the
   federation-level count is accepted.
5. Use isolated circles instead of a shared scope if cross-circle overlap would
   create unacceptable privacy risk.

## Worked example

<!-- use-case-example: federated-moderation -->

## What to verify

- Each event verifies independently with `verifyProof`, using proof v2 for new
  deployments.
- `verifyFederation(events).valid` is true, with one shared subject and one
  shared scope.
- Each participating circle is accepted by the federation policy.
- The federation-level `distinctSigners` count and any per-circle thresholds
  meet the action threshold.
- Clients understand that repeated scoped key images reveal cross-circle
  membership overlap for an otherwise anonymous contributor.

## What this proves

- Each event independently verifies.
- All events agree on subject and scope.
- Matching scoped key images are counted once across circles.
- A member who contributed in multiple circles does not inflate the total.

## What not to claim

- Do not claim scoped federation proves the circles are independent. It only
  deduplicates overlapping contributors.
- Do not claim unscoped events can be deduplicated later. The scope must be part
  of contribution creation.
- Do not claim overlap is private. Shared scoped key images intentionally reveal
  that the same unknown member contributed in more than one circle.

## Failure handling

- Reject federations with mixed subjects, mixed scopes, mixed assertion kinds,
  unknown circles, or invalid per-event proofs.
- Fall back to showing separate circle results when overlap privacy is more
  important than deduplication.
- Escalate disagreement between circles according to the federation policy
  rather than averaging away a meaningful split.
- Rotate or remove captured circles through governance; the proof layer cannot
  repair bad federation membership.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| Scoped federation reveals that the same unknown contributor appeared in more than one circle. | Use scoped federation only when deduplication is worth that overlap signal. Otherwise keep circles unscoped and display separate circle results. |
| The proof does not prove circles are independent. | Publish federation membership rules, circle admission policies, and governance for conflicts or captured circles. |
| Unscoped events cannot be deduplicated across circles. | Create circles with the same `scope` before collecting contributions; do not try to retrofit deduplication onto isolated events. |
| Different circles may disagree. | Define client policy for thresholds, weighting, abstentions, and whether disagreement blocks action or lowers confidence. |

## Policy choices

- Is revealing cross-circle overlap acceptable for this federation?
- Which communities are allowed to share the scope?
- Does the federation require every circle to meet its own threshold first?
- How should clients display disagreement between circles?
