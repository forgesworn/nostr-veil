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

## Subject design

- Use this profile when the verifier will act on one immutable event id.
- Put the event id in both `d` and `e`; proof v2 binds the reviewer score to
  that exact event and assertion kind.
- Do not reuse the score for a quoted note, screenshot, edit, correction, or
  paraphrase. Those are different subjects.
- If the claim has a long-running review record, score the addressable review
  record with kind 30384 and link it to the event separately.

## What to publish

- A kind 30383 assertion created with `aggregateEventContributions`.
- A `rank` profile that says whether the value represents accuracy,
  confidence, harm, priority, or review quality.
- Optional count metrics only when the profile explains what they count, such
  as reviewed reactions or substantive comments.
- Separate evidence, correction, and methodology events for humans; the
  nostr-veil event should carry the verifiable aggregate signal.

## Implementation recipe

1. Treat the event id as immutable: the score is about that exact event, not a
   later correction or paraphrase.
2. Publish the review method that maps reviewer judgement to `rank`.
3. Use proof v2 so the proof cannot be replayed as a user, addressable, or
   identifier assertion.
4. Verify strict syntax, the expected event id, the expected circle, the
   threshold, and any freshness or correction policy.
5. Link corrections or evidence with separate events if the client needs more
   than the numeric signal.

## Worked example

<!-- use-case-example: event-claim-verification -->

## What to verify

- Strict syntax and a valid proof v2.
- Kind 30383, with `d` and `e` equal to the event id currently being displayed
  or acted on.
- The reviewer ring is one the client trusts for this claim class, and the
  threshold is high enough for the UI action.
- The `rank` profile is known before display; do not compare scores from
  circles that use different meanings.
- The event has not been superseded by a correction, later review, or local
  freshness policy.

## What this proves

- Distinct members of the fact-checking circle scored that exact event id.
- The aggregate metric tags match the signed contribution messages.
- Proof v2 prevents the same contribution being replayed as a user,
  addressable, or identifier assertion.

## What not to claim

- Do not claim the proof makes the event objectively true or false. It proves a
  threshold reviewer signal.
- Do not claim the proof includes the evidence. Evidence links and rationale
  must be separate events or application records.
- Do not claim later edits, corrections, or reposts inherit the score unless the
  profile explicitly scores a living review record.

## Failure handling

- Reject wrong-event assertions, unknown circles, stale reviews, and assertions
  whose `rank` method is not published.
- If a reviewed event is corrected, publish a new assertion for the correction
  or link a supersession event so clients can stop showing the old result as
  current.
- Show disagreement between independent review circles instead of collapsing it
  into one unexplained score.
- Escalate high-impact or low-quorum claims to human review before applying
  automatic visibility changes.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove the event content is objectively true. | Publish the fact-checking method, evidence links, and correction rules. Treat the nostr-veil assertion as the verifiable reviewer signal. |
| The proof does not explain reviewer methodology by itself. | Define a public provider profile for `rank`, quorum, eligible reviewers, conflicts, and freshness. |
| The subject event can be deleted or superseded. | Score the exact event id, then publish a new assertion for corrections or later versions. Clients should display supersession state separately. |

## Policy choices

- Does `rank` mean accuracy, confidence, harm, or review quality?
- Should clients show the score before a quorum is reached?
- Should later corrections create a new assertion or update the same subject?
- Should reviewers be independent, specialist, local, or community-selected?
