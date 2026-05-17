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

## Implementation recipe

1. Decide whether the subject is the list event, the list author, the labeler
   service, or an external feed.
2. Define what `rank` measures: accuracy, coverage, abuse resistance,
   freshness, political alignment, or operational reliability.
3. Use proof v2 and verify the expected subject, circle, namespace or address,
   threshold, and freshness.
4. Score list revisions separately when the contents materially change, or
   publish an expiry policy for living lists.
5. Let clients combine several circle scores instead of treating one list score
   as universal truth.

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

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove every item in the list is correct. | Use spot checks, item-level review where needed, freshness windows, and correction channels. |
| A list score does not prove the author is trustworthy in general. | Score operator pubkeys separately when author reputation matters. Keep list quality and operator reputation distinct. |
| The reviewed list or labeler is public. | Use nostr-veil to hide reviewers, not the subject. If the subject itself is sensitive, use an app-private identifier and access-controlled context. |
| Different communities may value different curation choices. | Publish the scoring profile and let clients choose circles aligned with their own policy. |

## Policy choices

- Is the subject the list event, the list author, or the external labeler feed?
- Does `rank` mean accuracy, coverage, abuse resistance, political alignment,
  freshness, or some combination?
- How should clients handle disagreement between several circles?
- Should list revisions inherit older scores?
