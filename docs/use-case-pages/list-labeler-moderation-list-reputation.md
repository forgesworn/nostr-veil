# Community list, labeler, and moderation-list reputation

Use this when users or communities want to compare curation sources without
publishing a graph of everyone who reviews labelers, lists, or filter feeds.

## Fit

- Status: supported today.
- NIP-85 kind: 30384 when the list or labeler profile is addressable; 30382
  when scoring an operator pubkey; 30385 when scoring an external feed.
- Subject examples: `30000:<pubkey>:trusted-relays`,
  `30000:<pubkey>:mute-list`, `labeler:https://labels.example.com/main`.
- Helpers: `aggregateAddressableContributions`, `aggregateContributions`, or
  `aggregateIdentifierContributions` depending on the subject.
- Proof version: v2 recommended for typed helper workflows.
- Useful metrics: `rank`, and supported event/addressable count metrics.

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
const listAddress = `30000:${listAuthorPubkey}:trusted-relays`
const circle = createTrustCircle(curators.map(c => c.pubkey))

const contributions = curators.map((curator) =>
  contributeAddressableAssertion(
    circle,
    listAddress,
    {
      rank: curator.listQualityRank,
      reaction_cnt: curator.itemsReviewed,
    },
    curator.privateKey,
    circle.members.indexOf(curator.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateAddressableContributions(
  circle,
  listAddress,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid list assertion')
```

## What this proves

- Distinct curators scored the exact addressable list or labeler profile.
- The aggregate quality signal is verifiable.
- The reviewers are hidden inside the public circle.

## What not to claim

- It does not prove every item in the list is correct.
- It does not prove the list author is trustworthy in general.
- It does not hide which list is being reviewed.

## Policy choices

- Is the subject the list event, the list author, or the external labeler feed?
- Does `rank` mean accuracy, coverage, abuse resistance, political alignment,
  freshness, or some combination?
- How should clients handle disagreement between several circles?
- Should list revisions inherit older scores?
