# Anonymous credential or attestation co-signing

This is a future profile. nostr-veil can already attach an anonymous
threshold-backed score to a credential or attestation event, but it does not yet
define the credential format, endorsement semantics, expiry, revocation, or
presentation rules.

## Fit

- Status: future profile, with a supported building block today.
- Current NIP-85 shape: kind 30383 for an attestation event id, or 30384 for an
  addressable credential record.
- Subject: the credential or attestation event, not the holder in general.
- Helpers today: `contributeEventAssertion` or
  `contributeAddressableAssertion`.
- Proof version: v2 strongly recommended.
- Useful metric today: `rank` as endorsement confidence.

## Subject design

- Today, score the credential or attestation event, not the holder in general.
- Use kind 30383 when the attestation is a fixed event id.
- Use kind 30384 when the credential record is addressable and the profile
  defines how revisions, expiry, and revocation work.
- Do not use a generic holder pubkey score as a credential. Holder binding,
  presentation, and selective disclosure are separate protocol work.

## What to publish

- Today: a normal event or addressable assertion that says an attestor circle
  endorsed a specific credential artefact.
- A `rank` profile such as endorsement confidence, issuer-confidence score, or
  review completeness.
- Proof v2 tags, accepted attestor-circle policy, threshold, expiry, and the
  credential class being reviewed.
- Future profile data for holder binding, presentation challenge, disclosed
  attributes, revocation lookup, and verifier discovery.

## Implementation recipe for today's building block

1. Publish or identify the credential or attestation event to be scored.
2. Have the attestor circle publish a proof v2 event or addressable assertion
   against that exact subject.
3. Verify the expected subject, circle, threshold, and score before treating the
   attestation as endorsed.
4. Keep holder binding, presentation, selective disclosure, expiry, and
   revocation in the credential profile until nostr-veil has native support for
   those semantics.

## Worked example for today's building block

<!-- use-case-example: anonymous-credential-attestation-cosigning -->

## What to verify

- Today: strict syntax and a valid proof v2 for the attestation event or
  addressable credential record.
- The subject tag points to the exact credential artefact being considered.
- The attestor circle is accepted for that credential class and has enough
  distinct signers.
- The credential profile supplies holder binding, challenge/response,
  revocation, expiry, and disclosure checks before the verifier treats the
  presenter as credentialed.
- The assertion has not been superseded by revocation or a later credential
  revision.

## What this proves today

- A circle scored a specific attestation event.
- Distinct members contributed, without being named.
- The aggregate score is bound to the event id.

## What a full profile still needs

- A credential or attestation event format.
- Holder binding and presentation rules.
- Expiry and revocation semantics.
- Whether endorsements are binary, ranked, weighted, or scoped.
- How a verifier discovers the right circle for the credential class.

## What not to claim

- Do not claim nostr-veil currently issues anonymous credentials. It can score
  or endorse a credential artefact today.
- Do not claim a scored credential proves the presenter is the holder without a
  holder-binding and presentation protocol.
- Do not claim selective disclosure, revocation, or expiry semantics exist until
  a credential profile defines them.

## Failure handling

- Reject credential endorsements that point at the wrong artefact, unknown
  attestor circles, stale records, or unsupported credential classes.
- Treat missing revocation or holder-binding checks as a verifier failure, not
  as a weak warning.
- Publish superseding endorsement assertions when an attestation is corrected,
  revoked, or replaced.
- Keep personal attributes out of the nostr-veil assertion unless the credential
  profile explicitly and safely discloses them.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not currently issue anonymous credentials. | Define a credential or attestation event format, issuer rules, holder binding, and presentation flow. |
| Selective disclosure is not defined here. | Add a credential protocol that can reveal only the required attributes while keeping the nostr-veil proof as the anonymous endorsement signal. |
| The proof does not prove the credential subject is the presenter. | Add holder-binding keys, challenge/response presentation, and replay protection. |
| Revocation is not defined yet. | Add expiry, revocation events, revocation discovery, and client policy for stale credentials. |
