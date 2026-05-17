# Event and claim verification

Use this when the subject is a specific Nostr event: a claim, announcement,
report, moderation item, or fact-check target.

## Fit

- Status: supported today.
- NIP-85 kind: 30383 event assertion.
- Subject: event id in both `d` and `e`.
- Helpers: `contributeEventAssertion`, `aggregateEventContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank`, `comment_cnt`, `quote_cnt`, `repost_cnt`,
  `reaction_cnt`, `zap_cnt`, `zap_amount`.

## Worked example

```ts
import {
  aggregateEventContributions,
  contributeEventAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const claimEventId = 'aa'.repeat(32)
const circle = createTrustCircle(factCheckers.map(m => m.pubkey))

const contributions = factCheckers.map((checker) =>
  contributeEventAssertion(
    circle,
    claimEventId,
    {
      rank: checker.accuracyScore,
      reaction_cnt: checker.reviewed ? 1 : 0,
    },
    checker.privateKey,
    circle.members.indexOf(checker.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateEventContributions(
  circle,
  claimEventId,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid claim assertion')
```

## What this proves

- Distinct members of the fact-checking circle scored that exact event id.
- The aggregate metric tags match the signed contribution messages.
- Proof v2 prevents the same contribution being replayed as a user,
  addressable, or identifier assertion.

## What not to claim

- It does not prove the event content is objectively true.
- It does not explain reviewer methodology by itself.
- It does not prevent the subject event from being deleted or superseded.

## Policy choices

- Does `rank` mean accuracy, confidence, harm, or review quality?
- Should clients show the score before a quorum is reached?
- Should later corrections create a new assertion or update the same subject?
- Should reviewers be independent, specialist, local, or community-selected?
