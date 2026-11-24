# Anonymous group decisions, voting, and petitions

A fixed, known circle can make or signal a decision — a vote, a board or
committee resolution, or a petition — and publish a verifiable,
one-vote-per-member tally without recording who voted which way. Every other page
in this atlas scores a subject; this profile tallies a decision with the same
machinery. The LSAG primitive nostr-veil builds on gives a duplicate-resistant,
unlinkable ballot — a strong foundation for verifiable group decisions — so the
proof carries an anonymous threshold tally. The workflow around it (ballot format
and coercion-resistance) and the range limits below are what keep this a future
profile.

## Fit

- Status: future profile, with a supported tally building block today.
- NIP-85 kind: 30383 for a posted motion event. Use 30384 for a standing or
  addressable motion, or 30385 for an app-private ballot identifier.
- Subject: the motion, proposal, or petition id. Never a voter.
- Helpers: `contributeEventAssertion`, then `aggregateEventContributions` with
  `{ aggregate: 'sum' }`, then `verifyUseCaseProfile`, or `verifyProof` with
  `requireAggregate: 'sum'` and `contributionBounds` for the ballot. Use
  `verifyFederation` to count distinct voters across sub-circles that share a
  `scope`.
- Proof version: v2, so the ballot is bound to the motion kind and id and cannot
  be replayed onto another motion.
- Useful metric: `rank` as the ballot — 1 for aye, 0 against, summed into the
  count of ayes. Because `rank` is validated as 0–100, the aye-count must stay
  within 100, so the sum tally suits boards, committees, and panels (the
  small-electorate boardroom setting) rather than mass ballots.
- For a petition or approval count, read `distinctSigners`, the number of
  distinct signatories, instead of a summed `rank`, so the count is not limited
  to the 0–100 range. It is still limited by event size: each signature carries
  one response per ring member, so an event grows with ring size times signers
  (see *Operational requirements*). Multi-choice and ranked ballots are not
  supported yet; see *What a full profile still needs*.

## Subject design

- Identify the decision by a stable id: an event id for a posted motion, a NIP-33
  address for a standing motion, or an app-private identifier for an internal
  ballot.
- Use one subject, and therefore one election id, per decision. Reusing a subject
  across two votes would let a ballot from the first count in the second.
- Keep voter identity and ballot-secrecy material out of the subject. The subject
  is public once published.
- Keep the motion text, eligibility list, and quorum rule in the circle's
  governance record, not inside the proof.

## What to publish

- A NIP-85 event for the motion whose metric tag is the tally, with `veil-agg`
  recording `sum`.
- `veil-ring` for the electorate, `veil-threshold` for signers against circle
  size (turnout; the proof does not encode a quorum), the proof v2 tags, and one
  `veil-sig` per ballot.
- The aggregate only. Do not publish per-voter ballots tied to identities; the
  ring proof already binds the count to distinct members without naming them.

## Implementation recipe

1. Agree the electorate and admit its members into a trust circle.
2. Identify the motion by a stable subject id.
3. Collect one anonymous ballot per member: `{ rank: 1 }` for aye, `{ rank: 0 }`
   against.
4. Aggregate with `{ aggregate: 'sum' }` so the published `rank` tag is the count
   of ayes. Pass the ballot bounds as `contributionBounds` too, so a ballot that
   is not 0 or 1 is refused before you publish.
5. Sign and publish the aggregate as a standard Nostr event.
6. Verify with `verifyUseCaseProfile`, or with `verifyProof(event, {
   requireProofVersion: 'v2', requireAggregate: 'sum', contributionBounds })`;
   read `distinctSigners` as turnout and the `rank` tag as ayes.

## Worked example

<!-- use-case-example: anonymous-group-decisions -->

## What to verify

- Strict syntax and a valid proof v2.
- The kind matches the motion route, `d` equals the exact motion id, and the `e`
  subject hint matches.
- `veil-agg` is `sum`, and the `rank` tag matches the recomputed sum of the
  signed ballots. The publisher chooses that tag, so require it: the same
  ballots published as a `max` or a `median` verify as a proof and read as a
  different result.
- Every ballot is 0 or 1. A key image stops a second ballot, not a ballot worth
  more than one.
- The ring is the accepted electorate, and `veil-threshold` meets the quorum the
  governance policy requires.
- The motion id is not reused from an earlier decision.

## What this proves today

- Distinct members of the published electorate cast ballots, each unlinked to
  identity.
- The published tally matches the signed ballots, and turnout (`distinctSigners`)
  is provable.
- No party, including whoever ran the tally, can link a ballot to its signer —
  there is no escrow or opening authority. Ballot values themselves are public
  inside the proof, so what is hidden is who cast which ballot, not the ballot.
- Read the `rank` tag only alongside `distinctSigners` and circle size: ayes are
  `rank`, against votes are `distinctSigners − rank`, and abstentions are circle
  size − `distinctSigners`. The `rank` tag alone cannot distinguish an against
  vote from an abstention.

## What not to claim

- Do not claim it is receipt-free or coercion-resistant. A voter can demonstrate
  how they voted, so it is unsuitable where vote-buying or coercion is in scope.
- Do not claim individual ballots are hidden. Ballot values are public but
  anonymous; a small or lopsided electorate can leak the distribution.
- Do not claim it supports weighted or cumulative multi-vote rules. One ballot
  per member is enforced.
- Do not claim the proof establishes eligibility, quorum legitimacy, or that the
  motion is well-formed.
- Do not treat a bare `verifyProof(event)` as a tally check. It confirms the
  published value matches the signed ballots under whichever aggregate the
  publisher named. It does not bound a ballot or require `sum`.
- Do not claim every ballot cast is in the tally. The signatures are public, so
  any publisher can republish a subset of them; compare turnout with the quorum,
  and name the aggregator's key in the deployment policy (`acceptedPublishers`)
  so that nobody else can.

## What a full profile still needs

- A ballot and motion event format: option encoding, abstentions, tie-breaks, and
  ranked or score layout across metric keys.
- A coercion-resistance decision, and the companion protocol or coordinator that
  provides receipt-freeness where it is required.
- Failure handling for replayed, wrong-motion, and late ballots, and for quorum
  failure.
- A canonical motion-subject helper and accepted-circle policy for the
  electorate.

## Failure handling

- Reject ballots whose motion id, kind, electorate ring, aggregate rule, or proof
  version does not match the decision policy.
- Reject a tally whose `rank` tag does not match the recomputed sum, and a
  turnout below the required quorum.
- Reject a tally that holds a ballot outside 0 or 1. The aggregator should leave
  that ballot out and publish again.
- Treat a missing coercion-resistance control as a profile limitation to disclose
  for any decision where coercion is plausible.
- Publish a fresh tally for re-votes or corrected motions instead of mutating an
  existing decision event.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The tally is not receipt-free or coercion-resistant. | For coercion-sensitive decisions, add a receipt-free companion layer or a coordinator-based scheme; do not use this profile alone for binding secret ballots. |
| Ballot values are public, only anonymous. | A small or lopsided electorate can leak the ballot distribution; size the electorate to the risk and publish only the aggregate where the profile allows. |
| The `rank` sum tally is capped at 100. | The aye-count rides on the 0–100 `rank` metric, so an event with more than 100 ayes fails NIP-85 validation. Keep the electorate's aye-count within 100 (boards, committees, panels); for larger approval counts read `distinctSigners` instead of a summed `rank`. |
| A scoped petition reveals cross-circle overlap. | Use a `scope` only when federated counting across sub-circles is worth exposing that one signatory appears in several of them; omit it for petition circles where overlap must stay hidden. |
| A member signs a ballot worth more than one, or the tally is republished under another aggregate. | Verify through the profile, or pass `contributionBounds` and `requireAggregate: 'sum'` to `verifyProof`. A signed deployment bundle embeds the profile it was issued with, so re-issue any bundle created before these checks existed. |
| The event grows with ring size times ballots. | Each ballot carries one response per ring member. A ring of 100 with 10 ballots is about 80 KiB, above the 64 KiB default event limit of a stock strfry relay. Keep the electorate small, or check the limits of the relays in use. |
| A ballot could be replayed onto another motion. | Require proof v2, bind kind and motion id, and use one election id per decision. |
| Weighted or cumulative voting is not supported. | Keep one ballot per member; defer cumulative rules to a k-linkable ring-signature construction. |
| Eligibility and quorum are governance policy. | Publish electorate admission, quorum, and tally rules, and verify `veil-threshold` against them. |
