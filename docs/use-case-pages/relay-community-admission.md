# Relay or community admission

This is a future profile. nostr-veil can already publish a threshold-backed
vouch assertion about a candidate, but a full anonymous admission system needs a
separate access handshake and transport privacy.

## Fit

- Status: future profile, with a supported vouch assertion today.
- Current NIP-85 shape: kind 30382 user assertion for the candidate pubkey.
- Subject: candidate account pubkey.
- Helpers today: `contributeAssertion`, `aggregateContributions`,
  `verifyProof`.
- Proof version: v2 recommended.
- Useful metric today: `rank` as admission confidence.

## Subject design

- Today, the subject is the candidate pubkey and the output is a portable vouch
  assertion.
- Use kind 30382 with `d` and `p` equal to the candidate pubkey.
- Do not treat that public vouch as anonymous relay entry. Anonymous admission
  needs a separate challenge/response and transport design.
- A full profile must decide whether the admitted identity is a pubkey,
  credential presentation, session key, relay account, or community-specific
  capability.

## What to publish

- Today: a kind 30382 vouch assertion created with `aggregateContributions`.
- A `rank` profile such as admission confidence, sponsor confidence, or policy
  completeness.
- Proof v2 tags, accepted admission-circle policy, threshold, expiry, and
  revocation or ban rules.
- Future profile data for challenge/response, replay protection, session
  continuity, transport privacy, and post-admission abuse handling.

## Implementation recipe for today's building block

1. Publish a threshold-backed vouch assertion about the candidate pubkey.
2. Have the relay or community verify the expected circle, threshold, subject,
   and freshness.
3. Apply ordinary access policy based on that verified assertion.
4. Keep transport privacy, account creation, session continuity, revocation, and
   abuse handling outside nostr-veil until a full admission profile exists.

## Worked example for today's building block

<!-- use-case-example: relay-community-admission -->

## What to verify

- Today: strict syntax and a valid proof v2.
- Kind 30382, with `d` and `p` equal to the applicant pubkey.
- The admission circle is accepted by the relay or community and has enough
  distinct signers.
- The vouch is fresh, not revoked, and has a documented `rank` meaning.
- For full anonymous admission, also verify the admission challenge, replay
  protection, session binding, and transport requirements defined by the future
  profile.

## What this proves today

- Enough distinct members vouched for the candidate pubkey.
- No individual member is named.
- A relay or community can use the assertion as one policy input.

## What a full admission profile still needs

- A challenge/response handshake for the relay or community.
- Rules for presenting a proof without leaking equivalent metadata.
- Expiry and revocation.
- How the admitted user proves continuity after admission.
- Abuse handling after a vouched user is admitted.

## What not to claim

- Do not claim nostr-veil currently implements anonymous access control.
- Do not claim the vouch hides the candidate pubkey; today's building block is a
  public assertion about that pubkey.
- Do not claim a valid vouch overrides relay policy, bans, rate limits, or abuse
  response.

## Failure handling

- Reject vouches for the wrong pubkey, unknown admission circles, stale
  assertions, missing revocation checks, or insufficient thresholds.
- Fall back to manual or non-anonymous admission when the full handshake is not
  implemented.
- Publish revocation or expiry state for admitted users who later violate
  community rules.
- Design the future profile so failed presentations do not reveal more metadata
  than a normal denied admission attempt.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not currently implement anonymous access control. | Add a relay or community challenge/response protocol that accepts a verified threshold assertion. |
| IP address, timing, and relay metadata are outside the proof. | Add transport privacy, batching, careful relay logs, and metadata-minimising admission flows. |
| A user cannot enter a relay without relay policy. | Define policy for accepted circles, threshold, freshness, and what happens after admission. |
| Revocation and ban evasion are separate problems. | Add expiry, revocation, session continuity, abuse response, and re-admission rules. |
