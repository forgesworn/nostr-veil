# Source corroboration

Use this when an editorial, research, or investigation circle wants to say that
enough trusted people have prior knowledge of a source or document trail,
without recording which people vouched.

## Fit

- Status: supported today.
- NIP-85 kind: 30382 when the source has a Nostr pubkey; 30385 when the source
  is tracked by an external identifier.
- Subject: source pubkey, or an agreed identifier such as
  `source:newsroom-a:case-2026-05`.
- Helpers: `aggregateContributions` for pubkeys,
  `aggregateIdentifierContributions` for external identifiers.
- Proof version: v2 recommended for identifier subjects.
- Useful metrics: `rank` as source confidence, reliability, or corroboration
  strength.

## Subject design

- Use kind 30382 only when the source safely has a Nostr pubkey that can be
  public.
- Use kind 30385 for app-private source identifiers, document trails, case
  files, or sources that must not be tied to a public key.
- Design identifiers so they are stable inside the newsroom but do not reveal a
  real name, location, document title, or sensitive case note.
- Keep source identity confidence, claim confidence, and publication readiness
  as separate subjects or clearly defined metrics.

## What to publish

- A kind 30382 user assertion for a source pubkey, or a kind 30385 identifier
  assertion for an app-private source id.
- A documented `rank` meaning: identity confidence, reliability, document-trail
  strength, or contact confidence.
- The reviewer circle, threshold, aggregate method, proof v2 tags, and optional
  profile namespace for kind 30385.
- No raw source material, private contact notes, or identifying clues in public
  tags.

## Implementation recipe

1. Decide whether the source can be represented by a Nostr pubkey or needs an
   app-private external identifier.
2. Define what `rank` means: identity confidence, reliability, document trail
   strength, or contact safety.
3. Generate source identifiers so they are stable for the newsroom or
   investigation but do not dox the source.
4. Require proof v2 for kind 30385 identifiers, then verify the expected
   circle, subject, namespace, threshold, and score.
5. Keep editorial evidence, secure contact channels, and publication approval
   outside the nostr-veil proof.

## Worked example

This example uses an app-private identifier namespace. The `k` value `0` is a
profile choice for this application, not a Nostr-wide registry.

<!-- use-case-example: source-corroboration -->

## What to verify

- Strict syntax and a valid proof v2.
- The event kind matches the subject route: 30382 for a pubkey or 30385 for an
  identifier.
- `d` equals the exact source id being evaluated, and `p` or `k` matches the
  selected route.
- The reviewer ring is an accepted editorial circle and the threshold meets the
  desk's policy.
- The score is fresh for the reporting decision and is not being reused for a
  different case, source, or claim.

## What this proves

- The signed metrics came from distinct members of the published circle.
- The aggregate `rank` matches the signed confidence values.
- With proof v2, the proof is bound to kind 30385 and the `k` profile tag.

## What not to claim

- Do not claim the source's claim is true. The proof is a corroboration signal
  from the circle, not a fact-check result.
- Do not claim the source is safe to contact or publish. Safety and exposure
  risk require a separate editorial process.
- Do not claim the identifier is private if it embeds real-world details. The
  identifier is public once the assertion is published.

## Failure handling

- Reject assertions whose identifier, namespace, circle, threshold, or proof
  version does not match the investigation policy.
- Move stale or disputed source scores back to editorial review rather than
  keeping them as evergreen trust labels.
- Publish a new assertion for corrected, reclassified, or superseded source
  records instead of mutating the meaning of the old one.
- Keep any doxxing incident response outside the public proof and rotate
  identifiers when a mapping leaks.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove the source's claim is true. | Pair it with normal editorial verification: documents, independent confirmation, fact-checking, and correction policy. |
| The proof does not prove the source is safe to contact. | Use a separate source-risk review, secure contact plan, and least-knowledge handling for sensitive details. |
| The identifier can accidentally reveal too much. | Use a profile-defined identifier scheme, avoid real names or raw case notes, and document who can map identifiers back to internal records. |
| The proof does not hide timing, relay, or note metadata. | Batch contributions, use private collection channels where needed, and keep operational notes out of public assertions. |

## Policy choices

- What does `rank` mean: identity confidence, reliability, document quality, or
  some combined score?
- How is the source identifier generated so it is stable but not doxxing?
- Who is allowed into the editorial circle?
- How long should a source signal remain valid?
