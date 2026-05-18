# Future use-case delivery roadmap

Internal planning note. This is for deciding what must be true before a future
use case becomes a public promise. Do not link this from the README, the public
use-case atlas, or generated demo pages unless we intentionally turn it into a
public roadmap.

The public pages should stay focused on what developers can build safely today.
Future profiles can be mentioned there only as bounded building blocks with
clear caveats and practical mitigations.

## Compatibility stance

- Keep existing NIP-85 event compatibility unless a new companion protocol
  genuinely requires a new event shape.
- Prefer additive helpers, validation options, examples, and production recipes
  over version bumps.
- Keep proof v1 verification available for old events. Require proof v2 only in
  new production profiles where kind and subject binding matter.
- Do not promote a future profile to supported just because the proof verifies.
  Promotion requires the surrounding workflow to be implementable and testable.

## Promotion gates

Every future use case needs these gates before it moves from `profile-needed`
to `supported`.

| Gate | Required outcome |
| --- | --- |
| Subject model | The exact subject is defined: pubkey, event id, addressable event, external identifier, session key, or capability. |
| NIP-85 route | The kind, subject tag, and metric set are fixed and validated by `validateUseCaseProfileDefinition()`. |
| Proof policy | New examples use proof v2, set a threshold, define accepted circles, and reject stale assertions. |
| Companion protocol | Any workflow outside NIP-85 is specified: credential presentation, access handshake, revocation lookup, or service probe. |
| Verifier decision | A verifier can say exactly what action follows from a valid proof and what still needs external evidence. |
| Failure handling | Wrong subject, wrong kind, stale proof, unknown circle, revoked state, replay, and insufficient threshold all fail closed. |
| Worked example | There is a runnable example in `examples/use-cases/` and a production recipe where the use case affects a real decision. |
| Adversarial tests | Tests cover the misuse cases most likely to create a false real-world claim. |
| Relay evidence | The worked example passes the live relay harness before the public page calls it production-ready. |
| Public wording | Public docs say what the profile proves, what it does not prove, and which operational controls close the gap. |

## Milestone ledger

| Milestone | Status | Exit criteria |
| --- | --- | --- |
| Supported expansion hardening | In progress | Package, NIP-05/domain, and list/labeler use cases have profile-definition checks, production recipes, documented verifier actions, and tests proving executable examples do not use undocumented metrics. |
| Relay/community admission prototype | Not started | A reference gate verifies a vouch plus a separate challenge, rejects replay and wrong-relay presentations, and keeps admission policy outside the proof. |
| Credential/attestation co-signing profile research | Blocked on profile shape | A credential or attestation event format defines holder binding, presentation, expiry, and revocation before nostr-veil adds helper APIs. |
| Public promotion review | Not started | A future profile moves to `supported` only after companion protocol tests, production recipe, live relay evidence, and public wording all pass. |

## Candidate roadmap

### Anonymous credential or attestation co-signing

Current state: nostr-veil can score a specific credential or attestation event
with a threshold-backed proof v2 assertion. That is a useful endorsement signal,
but it is not a full credential system.

What must exist before promotion:

- A credential or attestation event profile with issuer, holder, subject, class,
  expiry, and revocation semantics.
- Holder binding so a presenter cannot reuse someone else's endorsed
  credential.
- Challenge/response presentation so a verifier can prevent replay.
- A revocation discovery rule: where to look, what kind of event or list counts,
  and how freshness is enforced.
- A verifier policy for accepted attestor circles per credential class.
- A production recipe that rejects wrong-holder, wrong-class, expired, revoked,
  stale, and replayed presentations.

Likely nostr-veil work:

- Keep the NIP-85 assertion as the endorsement layer.
- Add optional profile helpers only after the credential event shape is stable.
- Add verifier hooks for companion checks, for example holder binding and
  revocation status, without making nostr-veil the credential issuer.
- Add a worked example that shows: credential event, threshold endorsement,
  verifier challenge, holder response, revocation check, and final decision.

Do not claim publicly yet:

- That nostr-veil issues anonymous credentials.
- That a scored credential proves the presenter is the holder.
- That selective disclosure or revocation is solved by the ring proof alone.

### Relay or community admission

Current state: nostr-veil can publish a threshold-backed vouch assertion about
an applicant pubkey. A relay or community can use that as one policy input.
That is not the same as anonymous access control.

What must exist before promotion:

- An admission challenge/response flow owned by the relay or community.
- A subject-binding decision: admitted pubkey, session key, capability token,
  account record, or credential presentation.
- Replay protection tied to a nonce, relay, community, expiry, and session.
- Revocation and ban handling that does not depend on the original reviewers
  remaining online.
- Rate-limit and staged-permission policy after admission.
- Metadata guidance for IP address, timing, relay logs, and failed admission
  attempts.
- A production recipe that distinguishes `admit`, `manual-review`,
  `rate-limit`, `deny`, and `revoke`.

Likely nostr-veil work:

- Keep the current kind 30382 vouch as the portable public signal.
- Add an admission verifier example that consumes a signed vouch and a separate
  relay challenge.
- Add test vectors for replay, wrong relay, wrong applicant, expired vouch,
  revoked applicant, unknown admission circle, and insufficient threshold.
- Consider an additive helper only when the challenge shape is stable enough to
  avoid locking in the wrong API.

Do not claim publicly yet:

- That nostr-veil grants relay access by itself.
- That the current public vouch hides the applicant pubkey.
- That proof validity overrides relay policy, bans, rate limits, or abuse
  response.

### Package, release, and maintainer reputation expansion

Current state: this is already supported as an identifier assertion. The future
work is not a new proof profile; it is integration depth.

What would make it stronger:

- Optional resolver/adaptor examples for npm, GitHub releases, repository tags,
  package signatures, provenance, SBOMs, and vulnerability feeds.
- A production recipe that distinguishes `surface-reviewed-release`,
  `manual-review`, `warn`, and `block`.
- Tests that reject mismatched package names, version drift, unverified release
  subjects, stale review assertions, and unknown security-review circles.

Public positioning:

- Keep saying the proof carries reviewer consensus.
- Do not imply it scans code, proves safety, or replaces supply-chain controls.

### NIP-05, domain, and service-provider trust expansion

Current state: this is already supported as an identifier assertion. The future
work is resolver and incident-response integration.

What would make it stronger:

- Resolver examples for DNS, HTTPS, NIP-05, LNURLp, NIP-96, and service-specific
  probes.
- Freshness and revocation policy for compromised providers.
- Tests that reject canonicalisation drift, service mismatch, stale probes,
  unknown provider-review circles, and wrong subject tag values.

Public positioning:

- Keep saying nostr-veil carries the circle's assessment after service checks.
- Do not imply it proves domain control or service uptime by itself.

### Community list, labeler, and moderation-list reputation expansion

Current state: this is already supported across addressable, user, or identifier
assertions. The future work is better resolver guidance for list-like subjects.

What would make it stronger:

- Examples for NIP-51 lists, NIP-32 labels, moderation feeds, and external
  label services.
- A profile decision tree for choosing kind 30382, 30384, or 30385.
- Tests that reject wrong list addresses, stale list revisions, unaccepted
  reviewer circles, and policy-incompatible metrics.

Public positioning:

- Keep saying the proof backs a review circle's judgement about a list or
  service.
- Do not imply one community's list reputation is universal or politically
  neutral.

## Working order

1. Keep future-profile language modest in public pages.
2. Build deeper internal examples and adversarial tests first.
3. Promote only the smallest stable helper API needed by those tests.
4. Add production recipes before marketing the use case as supported.
5. Refresh live relay evidence after any public-page or example change.

## Decision rule

If the missing piece is only policy, document it as an operational control. If
the missing piece is protocol behaviour, keep the use case as `profile-needed`
until we have a runnable reference flow and failure tests.
