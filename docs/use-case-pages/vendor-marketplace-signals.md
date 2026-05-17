# Vendor and marketplace signals

Use this when a community wants portable, anonymous reputation for vendors,
marketplace counterparties, or recurring scam patterns.

## Fit

- Status: supported today.
- NIP-85 kind: 30382 if the vendor is a Nostr pubkey; 30385 if the subject is
  an external marketplace identifier.
- Subject examples: vendor pubkey, `vendor:market.example:alice`,
  `market:example:item-seller-42`.
- Helpers: `aggregateContributions` for pubkeys,
  `aggregateIdentifierContributions` for external identifiers.
- Proof version: v2 recommended.
- Useful metrics: `rank`, `comment_cnt`, `reaction_cnt`.

## Subject design

- Use kind 30382 when the vendor, buyer, escrow agent, or marketplace actor is
  a Nostr pubkey.
- Use kind 30385 when the subject is a marketplace account, listing, order
  pattern, payment handle, or recurring scam identifier.
- Keep vendor identity, trade fulfilment, dispute behaviour, fraud reports, and
  marketplace reliability as separate subjects where clients need different
  actions.
- Decide whether identifiers are market-local or intentionally portable across
  markets before publishing them.

## What to publish

- A kind 30382 user assertion or kind 30385 identifier assertion, depending on
  the subject.
- A `rank` profile that says whether the score represents fulfilment
  reliability, dispute risk, fraud risk, communication quality, or overall
  counterparty confidence.
- Proof v2 tags, accepted circle policy, evidence standard, minimum threshold,
  expiry, recovery, and appeal rules.
- Separate dispute records, escrow outcomes, refund decisions, or moderator
  notes when the marketplace needs a complete case history.

## Implementation recipe

1. Decide whether the subject is a Nostr pubkey, a marketplace-specific vendor
   id, an item listing, or a recurring scam pattern.
2. Define what `rank` means: fulfilment reliability, dispute risk, fraud risk,
   communication quality, or overall counterparty confidence.
3. Require evidence rules before negative reports, especially if no trade was
   completed.
4. Use proof v2 and verify the expected subject, namespace, circle, threshold,
   and freshness.
5. Keep dispute resolution, refunds, identity checks, and recovery policy in
   the marketplace layer.

## Worked example

This example uses a private identifier profile. It is intentionally not a
global vendor registry.

<!-- use-case-example: vendor-marketplace-signals -->

## What to verify

- Strict syntax and a valid proof v2.
- The assertion route matches the marketplace subject: `p` for Nostr pubkeys or
  `k` for marketplace identifiers.
- The counterparty-review circle is trusted for this market and has enough
  distinct signers for the value at risk.
- The `rank` meaning matches the UI action: warning, escrow requirement,
  search ranking, suspension, or manual review.
- The assertion is fresh and not superseded by a dispute resolution, recovery
  assertion, or fraud incident.

## What this proves

- Distinct members of the counterparty circle contributed the trade signal.
- The final metric tags match the signed anonymous contributions.
- The signal is portable as a Nostr event.

## What not to claim

- Do not claim the proof adjudicates disputes or proves fraud by itself.
- Do not claim an external vendor identifier proves real-world identity unless
  the marketplace separately verified it.
- Do not claim old negative scores should last forever. Reputation needs
  expiry, recovery, and re-review policy.

## Failure handling

- Reject assertions with weak evidence, unknown circles, wrong subject routes,
  stale scores, or unclear metric direction.
- Send high-value or contested cases to dispute review before applying automatic
  marketplace penalties.
- Publish recovery, refund, or correction assertions when a case is resolved or
  an account is restored.
- Keep market-local identifiers local unless cross-market linking is a stated
  safety feature.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not adjudicate disputes. | Add evidence submission, dispute review, appeal paths, refund policy, and moderator escalation. |
| The proof does not prove vendor identity outside the chosen profile. | Use Nostr pubkeys, marketplace account checks, NIP-05/domain checks, escrow records, or other identity controls as appropriate. |
| Colluding circle members can still coordinate. | Use circle admission policy, independent circles, federation thresholds, and anomaly review for high-value markets. |
| Old negative scores can become stale. | Define expiry, recovery, pardon, or re-review rules so reputation can change when behaviour changes. |

## Policy choices

- Are negative reports allowed without a completed trade?
- How are refunds, delivery failures, and fraud weighted?
- How does a vendor recover from old bad scores?
- Should marketplace-specific identifiers be linkable across markets?
