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

## Worked example

This example uses a private identifier profile. It is intentionally not a
global vendor registry.

```ts
import {
  aggregateIdentifierContributions,
  contributeIdentifierAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const marketplaceProfileKind = '0'
const vendorId = 'vendor:market.example:alice'
const circle = createTrustCircle(counterparties.map(c => c.pubkey))

const contributions = counterparties.map((counterparty) =>
  contributeIdentifierAssertion(
    circle,
    vendorId,
    marketplaceProfileKind,
    {
      rank: counterparty.tradeRank,
      reaction_cnt: counterparty.completedTrades,
    },
    counterparty.privateKey,
    circle.members.indexOf(counterparty.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateIdentifierContributions(
  circle,
  vendorId,
  marketplaceProfileKind,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid vendor assertion')
```

## What this proves

- Distinct members of the counterparty circle contributed the trade signal.
- The final metric tags match the signed anonymous contributions.
- The signal is portable as a Nostr event.

## What not to claim

- It does not adjudicate disputes.
- It does not prove a vendor identity outside the chosen identifier profile.
- It does not prevent colluding circle members.

## Policy choices

- Are negative reports allowed without a completed trade?
- How are refunds, delivery failures, and fraud weighted?
- How does a vendor recover from old bad scores?
- Should marketplace-specific identifiers be linkable across markets?
