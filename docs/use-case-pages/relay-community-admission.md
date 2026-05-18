# Relay or community admission

This is a future full anonymous-access profile. nostr-veil can publish a
threshold-backed vouch assertion about a candidate and provides a reference
pubkey-bound admission challenge around that vouch. A complete anonymous
admission system still needs session continuity, abuse handling, and transport
privacy outside the NIP-85 assertion.

## Fit

- Status: future profile, with a supported vouch assertion today.
- Current NIP-85 shape: kind 30382 user assertion for the candidate pubkey.
- Subject: candidate account pubkey.
- Helpers today: `contributeAssertion`, `aggregateContributions`,
  `verifyProof`, `createAdmissionChallenge`,
  `createAdmissionPresentation`, and `verifyAdmissionRequest`.
- Proof version: v2 recommended.
- Useful metric today: `rank` as admission confidence.

## Subject design

- Today, the subject is the candidate pubkey and the output is a portable vouch
  assertion.
- Use kind 30382 with `d` and `p` equal to the candidate pubkey.
- Do not treat that public vouch as anonymous relay entry. The reference
  challenge proves a live applicant controls the vouched pubkey; transport
  privacy and session policy are still separate.
- A full profile must decide whether the admitted identity is a pubkey,
  credential presentation, session key, relay account, or community-specific
  capability.

## What to publish

- Today: a kind 30382 vouch assertion created with `aggregateContributions`.
- A `rank` profile such as admission confidence, sponsor confidence, or policy
  completeness.
- Proof v2 tags, accepted admission-circle policy, threshold, expiry, and
  revocation or ban rules.
- Admission challenge and presentation data for replay protection, plus future
  profile data for session continuity, transport privacy, and post-admission
  abuse handling.

## Implementation recipe for today's building block

1. Publish a threshold-backed vouch assertion about the candidate pubkey.
2. Have the relay or community create an admission challenge for that pubkey and
   audience.
3. Have the applicant sign the challenge with the vouched pubkey.
4. Use `verifyAdmissionRequest()` to verify the signed presentation, signed
   deployment bundle, expected circle, threshold, subject, freshness, and rank.
5. Apply ordinary access policy based on that verified result.
6. Keep transport privacy, account creation, session continuity, revocation, and
   abuse handling outside nostr-veil until a full admission profile exists.

## Worked example for today's building block

<!-- use-case-example: relay-community-admission -->

## What to verify

- Today: strict syntax and a valid proof v2.
- Kind 30382, with `d` and `p` equal to the applicant pubkey.
- The admission circle is accepted by the relay or community and has enough
  distinct signers.
- The vouch is fresh, not revoked, and has a documented `rank` meaning.
- The admission challenge is fresh, for the expected relay or community
  audience, not replayed, and signed by the vouched applicant pubkey.
- For full anonymous admission, also verify session binding and transport
  requirements defined by the future profile.

## What this proves today

- Enough distinct members vouched for the candidate pubkey.
- No individual member is named.
- The applicant controlled the vouched pubkey for this admission challenge.
- A relay or community can use the verified result as one policy input.

## What a full admission profile still needs

- Rules for presenting a proof without leaking equivalent metadata.
- Shared expiry and revocation semantics.
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
- Reject presentations for the wrong audience, expired challenges, replayed
  challenges, invalid applicant signatures, or a pubkey that does not match the
  vouch subject.
- Fall back to manual or non-anonymous admission when the full handshake is not
  implemented.
- Publish revocation or expiry state for admitted users who later violate
  community rules.
- Design the future profile so failed presentations do not reveal more metadata
  than a normal denied admission attempt.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not currently implement complete anonymous access control. | Use the reference challenge for pubkey-bound admission, then add session continuity, transport privacy, and community access policy. |
| IP address, timing, and relay metadata are outside the proof. | Add transport privacy, batching, careful relay logs, and metadata-minimising admission flows. |
| A user cannot enter a relay without relay policy. | Define policy for accepted circles, threshold, freshness, and what happens after admission. |
| Revocation and ban evasion are separate problems. | Add expiry, revocation, session continuity, abuse response, and re-admission rules. |
