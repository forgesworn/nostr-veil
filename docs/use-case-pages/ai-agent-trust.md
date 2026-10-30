# AI agent trust and vouching

Use this when an agent host, MCP server, bot, or relay policy needs to decide
whether to trust an AI agent's Nostr key, and a human-curated circle is willing
to vouch for that key without naming which humans did.

## Fit

- Status: supported today as a vouch assertion. The patterns listed under
  *Building blocks* are not profiles.
- NIP-85 kind: 30382 user assertion.
- Subject: the agent's pubkey.
- Helpers: `contributeAssertion`, `aggregateContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank` as confidence that the key is a legitimately operated
  agent of the named operator, or is acceptable for the circle's purpose.

An agent has a pubkey like anyone else, but agent keys are free. A circle made
only of agent keys is a Sybil farm by construction, so nostr-veil adds nothing
there. It helps only when a human-curated circle stands behind the key: an
operator's maintainers, a community's reviewers, or a marketplace's verified
users. The verifier is usually another agent or an agent host that checks the
proof before acting, for example before reading a DM, accepting a task, paying
an invoice, or admitting a key.

## Subject design

- Use the agent's pubkey as the subject, in both `d` and `p`. Proof v2 binds the
  vouch to that key, not to a session, a model version, or a deployment.
- Name the operator in the circle's public policy, not in the proof. The proof
  says a threshold of the circle vouched for the key, not who the operator is.
- Keep one assertion per agent key. When the key rotates, vouch for the new key
  afresh instead of editing the old assertion.
- The agent pubkey is public. This profile hides the vouching humans, not the
  agent.

## What to publish

- A kind 30382 assertion created with `aggregateContributions`, about the agent
  pubkey.
- A `rank` value with a stated meaning, such as operator-verified confidence.
- Proof v2 tags, plus a public policy for the circle's curators, the threshold,
  expiry, revocation, and re-review.
- A short `expiration` so a leaked or retired key stops carrying a vouch.
- No operator contact details or review notes in the assertion content.

## Implementation recipe

1. The circle's curators agree what a vouch means and who may sign.
2. Members vouch for the agent key with `contributeAssertion`, and the
   assertion is aggregated and published with proof v2.
3. The verifier checks the circle before it checks the score. Accept a proof
   only when one of these holds:
   - the `veil-ring` circle ID is on the verifier's accepted list;
   - the publisher is trusted;
   - every ring member is already trusted.
4. A fraction of trusted members is not enough: one untrusted member could be
   the signer and the proof cannot say otherwise.
5. If the subject appears in its own ring, discount one signature per scope.
6. Report proofs from unknown circles as unverified-origin rather than scoring
   them. For example, the [bray MCP server](https://github.com/forgesworn/bray)
   applies this rule when it reads veil proofs.
7. Treat the result as one input to the action policy: read, accept, pay, or
   admit.

## Worked example

<!-- use-case-example: ai-agent-trust -->

## Building blocks

These are not profiles. They use the same primitives, and in each case the
circle's trust still comes from who curates its member list.

- One signature per agent per scope. An operator's fleet forms a circle, and any
  instance signs a report, vote, or moderation decision. The key image stops one
  instance signing twice per scope, and nobody can fingerprint which instance
  acted. This works today with `contributeEventAssertion` and
  `aggregateEventContributions`, or the identifier variants.
- Anonymous rate-limited access for agents. One admission per member per scope is
  the gate building block described in
  [relay or community admission](./relay-community-admission.md). Full anonymous
  access for agents remains a future profile.
- Anonymous review of agents and the services they front. A circle of verified
  users publishes a kind 30385 identifier assertion, as in
  [vendor and marketplace signals](./vendor-marketplace-signals.md) and
  [relay and service reputation](./relay-service-reputation.md).

## What to verify

- Strict NIP-85 syntax and a valid proof v2.
- Kind 30382, with `d` and `p` equal to the agent pubkey being considered.
- The circle is accepted under the rules in the recipe, and
  `proof.distinctSigners` meets the verifier's threshold.
- The signer is not the subject: if the agent pubkey is in the ring, one
  signature per scope is discounted.
- The `rank` meaning matches the circle's published policy.
- The assertion is fresh, and no later revocation or re-review replaces it.

## What this proves

- Enough distinct members of the circle vouched for this agent key.
- The agent key is bound to the proof.
- No individual vouching member is identified.

## What not to claim

- Do not claim the agent is safe, aligned, non-malicious, or still controlled by
  its operator. A vouch is a point-in-time admission signal.
- Do not claim uniqueness. One operator can run many vouched agents.
- Do not claim the agent is anonymous. Its pubkey is public.
- Do not treat agent-to-agent vouching as evidence. Without a human-curated
  publisher it proves nothing about Sybil resistance, and a verifier should
  ignore it.
- Do not claim a trusted fraction of a ring is enough. See the recipe.

## Failure handling

- Reject proofs from unknown circles, below-threshold circles, expired
  assertions, or assertions about a different key. Report unknown circles as
  unverified-origin.
- Fall back to manual approval, or to a low-privilege mode, when the proof is
  missing or unverifiable.
- Publish a revocation or a replacement assertion when the circle withdraws its
  vouch, and expire vouches by default.
- Fall back to manual review when independent circles disagree.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| Agent keys are free, so an agent-only circle is a Sybil farm. | Accept circles only when a named human curator, such as an operator or community, stands behind the member list. Ignore agent-to-agent vouching. |
| One untrusted member could be the signer. | Accept a circle ID, a trusted publisher, or a ring whose members are all trusted. Never accept a fraction. |
| An agent key leaks or is rotated. | Use short expiry, publish a revocation, and vouch for the new key afresh. Verifiers should check freshness every time. |
| The operator changes. | Treat the vouch as void on a change of operator. Re-review and publish a new assertion. |
| A vouched agent misbehaves. | Add post-admission enforcement, rate limits, and logging. The circle re-reviews and revokes. |
| One operator runs many vouched agents. | Do not read the vouch as uniqueness. Apply per-operator limits where numbers matter. |
| The proof says nothing about safety. | Keep spending caps, sandboxing, and human approval for high-risk actions. |

## Policy choices

- Which circles, publishers, or trusted rings does the verifier accept?
- What does `rank` mean, and what minimum does each action need?
- How long does a vouch last, and how is it revoked?
- Which actions need a vouch, and which still need human approval?
