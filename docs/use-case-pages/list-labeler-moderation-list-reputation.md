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

## Subject design

- Use kind 30384 for a Nostr list, labeler profile, moderation feed, or other
  addressable curation object.
- Use kind 30382 when the score is about the operator pubkey rather than a
  specific list.
- Use kind 30385 when the subject is an external label API, feed URL, or
  service identifier.
- Decide whether revisions inherit scores. For high-impact lists, treat each
  material list revision as a separate reviewed subject or apply a short expiry.

## What to publish

- The assertion kind that matches the thing clients will consume: list event,
  operator pubkey, or external feed.
- A `rank` profile that says whether the score measures accuracy, coverage,
  freshness, abuse resistance, operational reliability, or community alignment.
- Proof v2 tags and a policy describing accepted curator circles, thresholds,
  review sampling, correction channels, and expiry.
- Optional item-level review events when clients need to understand why a list
  or labeler scored well or poorly.

## Implementation recipe

1. Decide whether the subject is the list event, the list author, the labeler
   service, or an external feed.
2. Define what `rank` measures: accuracy, coverage, abuse resistance,
   freshness, political alignment, or operational reliability.
3. Use proof v2 and verify the expected subject, circle, namespace or address,
   threshold, and freshness.
4. Score list revisions separately when the contents materially change, or
   publish an expiry policy for living lists. In production, put list revision,
   sampling, and correction checks in `companionEvidence`.
5. Let clients combine several circle scores instead of treating one list score
   as universal truth.

## Worked example

<!-- use-case-example: list-labeler-moderation-list-reputation -->

## Companion evidence

The proof says accepted curators scored the same list or labeler subject. It
does not prove the fetched list revision is the revision they reviewed, or that
sample checks and correction paths exist. Require those checks explicitly and
derive the evidence from the fetched list event plus your sampling workflow,
using the collector or resolver helper that matches where the observations came
from.
The default list evidence ids are `list-revision-fetch`, `sample-review`, and
`correction-channel`. Use `collectListLabelerCompanionEvidence()` when the
verifier can fetch the addressable list event from a relay and probe the
correction channel. Use `resolveListLabelerCompanionEvidence()` when your
application already fetched the list revision and ran its sampling workflow.

```ts
const policy = createDeploymentPolicy(LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE, {
  companionEvidence: listLabelerCompanionEvidenceRequirements(subject, { maxAgeSeconds: 300 }),
  expectedSubject: subject,
  // accepted circles, metrics, freshness, and signature policy omitted here
})

const companionEvidence = await collectListLabelerCompanionEvidence({
  checkedAt: now,
  correctionChannel: correctionChannelUrl,
  fetch,
  relayUrl,
  sampleReview,
  subject,
  WebSocket,
})

const result = verifyProductionDeployment(assertionFromRelay, bundle, {
  companionEvidence,
  now,
  trustedPublishers,
})
```

`list-revision-fetch` should identify the exact Nostr addressable event or
external feed revision the client will use. `sample-review` records that the
deployment's sampling policy ran. `correction-channel` confirms there is a
reachable path for disputes, takedowns, or superseding list assertions.
For addressable Nostr lists, the resolver requires a valid event signature by
default. For external feeds, keep the same evidence ids only if you also add the
feed's signature, hash, or revision check to the observation workflow.
The lower-level building blocks are `fetchAddressableEventFromRelay()` and
`probeCorrectionChannel()`. For NIP-51 lists and NIP-32 labelers, keep the
addressable event signature check on by default; for non-Nostr feeds, add a
separate signature, hash, or immutable revision check before producing
`list-revision-fetch`.

## What to verify

- Strict syntax and a valid proof v2.
- The assertion kind and subject tag match the object the client is about to
  use: `a` for addressable lists, `p` for operators, or `k` for external feeds.
- The curator circle is trusted for this curation domain and the threshold is
  high enough for the action.
- The list or labeler revision being used is the one that was reviewed, or the
  profile explicitly allows living-list inheritance.
- The metric direction is known before comparing scores across circles.
- If the policy requires `companionEvidence`, missing, failed, stale, or
  wrong-subject evidence must reject the deployment decision.

## What this proves

- Distinct curators scored the exact addressable list or labeler profile.
- The aggregate quality signal is verifiable.
- The reviewers are hidden inside the public circle.

## What not to claim

- Do not claim the proof proves every item in the list is correct.
- Do not claim a list score proves the operator is trustworthy in every
  context. Score operator reputation separately when that matters.
- Do not claim one community's curation score is politically or socially
  neutral. Clients should choose circles aligned with their policy.

## Failure handling

- Reject assertions for the wrong list revision, unknown curator circles,
  mismatched subject route, stale review, or undocumented metric meaning.
- Re-review or expire list scores after material list changes.
- Publish item-level corrections or a superseding assertion when a list or
  labeler is found to include harmful, stale, or manipulated entries.
- Show disagreement between circles as disagreement, especially where curation
  goals differ by community.

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
