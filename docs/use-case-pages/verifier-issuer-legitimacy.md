# Verifier and issuer legitimacy

Use this when a community, relay, marketplace, grant programme, or credential
consumer needs to decide which verifiers, issuers, or witness services are
acceptable for a credential class. This answers "who verifies the verifier?"
without forcing the people reviewing the verifier to become public targets.

## Fit

- Status: supported today.
- NIP-85 kind: 30385 identifier assertion.
- Subject: a method-scoped verifier identifier such as
  `verifier:proof-of-person:in-person:<verifier-pubkey>`.
- Canonical helper: `canonicalVerifierSubject`.
- Helpers: `contributeIdentifierAssertion` and
  `aggregateIdentifierContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank` as verifier confidence, plus `reaction_cnt` as a
  count-like corroboration signal.

## Subject design

- Use `verifier:<credential-class>:<method>:<verifier-id>` when the community is
  deciding whether to trust a verifier for one credential class and method.
- Use separate subjects for different methods. A verifier trusted for
  `proof-of-person:in-person` is not automatically trusted for
  `proof-of-residency:document-check`.
- Use service subjects for verifier services only when the method and class are
  already captured elsewhere in the deployment policy.
- Do not use a generic domain or pubkey score when the decision depends on a
  specific verification ceremony, credential class, or issuer role.

## What to publish

- A kind 30385 identifier assertion whose `d` tag is the canonical verifier
  subject and whose `k` tag is the deployment namespace.
- A `rank` profile explaining whether the score means verifier legitimacy,
  issuer confidence, witness quality, method reliability, or incident status.
- Proof v2 tags, accepted reviewer-circle policy, threshold, freshness, and the
  credential class being considered.
- Companion records for verifier onboarding, audit results, revocation source,
  issuer metadata, accepted methods, and incident response.

## Implementation recipe

1. Define the credential class and verification method before reviewers sign.
2. Canonicalise the verifier with `canonicalVerifierSubject`.
3. Have an accepted reviewer circle publish proof v2 identifier contributions.
4. Verify the exact subject, `k` namespace, circle, threshold, freshness, and
   metric bounds.
5. Accept attestations from that verifier only when the concrete attestation
   artefact also passes holder binding, presentation, expiry, and revocation
   checks.

## Worked example

<!-- use-case-example: verifier-issuer-legitimacy -->

## What to verify

- Strict NIP-85 syntax and a valid proof v2.
- Kind 30385, with `d` equal to the canonical verifier subject and `k` equal to
  the deployment namespace.
- The reviewer circle is accepted for that credential class and method.
- `proof.distinctSigners` meets the verifier-legitimacy threshold.
- The `rank` meaning is documented before it affects verifier admission,
  warning, rate-limiting, or revocation.
- The concrete credential or attestation being consumed still passes its own
  issuer, holder, presentation, expiry, revocation, and evidence checks.

## What this proves

- Distinct members of an accepted reviewer circle scored the same verifier
  subject.
- The aggregate score is bound to the verifier subject, kind, and subject hint.
- Individual reviewer identities are hidden inside the ring.

## What not to claim

- Do not claim a trusted verifier makes every credential true.
- Do not claim nostr-veil verifies the underlying personhood, residency,
  professional status, or credential claim.
- Do not claim verifier legitimacy replaces revocation, audit, appeal, or
  incident response.
- Do not let trust for one credential class or method spill into another class
  without a separate assertion or explicit policy.

## Failure handling

- Reject verifier scores from unknown circles, stale manifests, wrong methods,
  wrong credential classes, or unaccepted namespaces.
- Treat missing holder-binding, presentation, expiry, or revocation checks on
  the concrete credential as a verifier failure.
- Publish downgrade, incident, or replacement assertions when a verifier is
  compromised, captured, negligent, or no longer accepted for a method.
- Route borderline scores to manual review rather than making verifier
  acceptance permanent.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| Verifier reputation becomes a single unchecked trust root. | Scope trust by credential class, method, issuer key, accepted circle, expiry, revocation, appeal path, and incident response. |
| A trusted verifier can still issue a bad credential. | Verify each concrete credential artefact, holder binding, presentation challenge, expiry, revocation, and evidence trail. |
| Reviewer pressure can capture verifier admission. | Use anonymous threshold review, conflict rules, rotation, audit logs, and independent circles for high-stakes methods. |
| First-person credentials and verifier-issued credentials start from different trust directions. | Treat first-person claims, social witnessing, verifier ceremonies, and anonymous circle endorsement as separate layers that policy combines explicitly. |

## Open questions for deployments

- Does `rank` mean verifier admission, ongoing reliability, incident severity, or
  method confidence?
- Which credential classes need method-scoped verifier subjects?
- What revocation source tells clients that a verifier is no longer accepted?
- Which Attestr-style, NIP-VA-style, NIP-58, or custom attestation artefacts can
  this verifier issue or witness?
