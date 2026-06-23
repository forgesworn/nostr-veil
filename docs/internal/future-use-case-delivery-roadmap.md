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
| Supported expansion hardening | Shipped as second hardening pass | Package, NIP-05/domain, and list/labeler use cases have profile-definition checks, production recipes, documented verifier actions, companion evidence requirements, collector/resolver helpers, and tests proving executable examples do not use undocumented metrics or static pass evidence for off-chain controls. |
| Verifier and issuer legitimacy | Shipped as supported profile | Communities can score method-scoped verifier subjects such as proof-of-person in-person verifiers, use the signal to decide which issuers or witness services to accept, and still verify each concrete credential artefact separately. |
| Relay/community admission gate | Shipped as building block | A reference gate verifies a kind 30382 vouch plus a separate challenge, rejects replay and wrong-relay presentations, keeps admission policy outside the proof, and has live relay evidence for the fetched vouch plus signed bundle carrier. |
| Credential/attestation co-signing profile research | Blocked on profile shape | A credential or attestation event format defines holder binding, presentation, expiry, and revocation before nostr-veil adds helper APIs. |
| Anonymous group decisions / voting profile research | Shipped as building block; full profile pending | The one-vote-per-member tally ships as a public atlas building block. A ballot/motion format, a coercion-resistance decision, and failure tests for replayed, wrong-motion, and late ballots are still needed before it is promoted from `profile-needed` to `supported`. See the worked page [anonymous-group-decisions.md](../use-case-pages/anonymous-group-decisions.md). |
| Healthcare clinician peer-rating vertical research | Candidate; demand evidenced | The medico-legal due-process model is resolved (never-de-anonymising vs auditable disclosure) and circle enrolment is defined before any public healthcare positioning. |
| Public promotion review | Not started | A future profile moves to `supported` only after companion protocol tests, production recipe, live relay evidence, and public wording all pass. |

## Candidate roadmap

### Anonymous credential or attestation co-signing

Current state: nostr-veil can score a specific credential or attestation event
with a threshold-backed proof v2 assertion. That is a useful endorsement signal,
and can separately score method-scoped verifiers or issuers before a community
accepts credentials from them. That is useful credential governance, but it is
not a full credential system.

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
an applicant pubkey and verify a reference challenge/presentation around that
vouch. A relay or community can use that as one policy input. That is not the
same as anonymous access control.

What has shipped as the pubkey-bound gate:

- `createAdmissionChallenge()`, `createAdmissionPresentation()`, and
  `verifyAdmissionRequest()` as additive helpers around the existing kind 30382
  vouch.
- A live relay smoke test that publishes the vouch and a separate NIP-78 kind
  30078 signed-bundle carrier, fetches both back by id, and verifies the fetched
  material.
- A public operator recipe that distinguishes `admit`, `manual-review`,
  `rate-limit`, `deny`, and `revoke`.

What must exist before promotion to full anonymous admission:

- A subject-binding decision: admitted pubkey, session key, capability token,
  account record, or credential presentation.
- Replay protection tied to a nonce, relay, community, expiry, and session.
- Revocation and ban handling that does not depend on the original reviewers
  remaining online.
- Rate-limit and staged-permission policy after admission.
- Metadata guidance for IP address, timing, relay logs, and failed admission
  attempts.
- A production relay/community implementation that proves the session and
  revocation model under real abuse handling.

Likely nostr-veil work:

- Keep the current kind 30382 vouch as the portable public signal.
- Keep the admission challenge as a companion object, not a new NIP-85 kind or
  mutation of the vouch event.
- Extend the reference verifier only additively as relay/community operators
  prove which session and revocation controls they actually need.

Do not claim publicly yet:

- That nostr-veil grants relay access by itself.
- That the current public vouch hides the applicant pubkey.
- That proof validity overrides relay policy, bans, rate limits, or abuse
  response.

### Package, release, and maintainer reputation expansion

Current state: this is already supported as an identifier assertion. The future
work is not a new proof profile; it is integration depth.

What would make it stronger:

- Signed deployment policies can now require companion evidence such as
  `npm-provenance`, `sbom`, and `vulnerability-feed` before accepting a score,
  and resolver helpers now derive that evidence from npm metadata, SBOM
  metadata, vulnerability feed output, optional artefact digests, and
  fixture-tested collectors for npm metadata, SBOM JSON, and OSV-style reports.
- Optional resolver/adaptor examples for GitHub releases, repository tags,
  package signatures, provenance services, and additional vulnerability feeds.
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

- Signed deployment policies can now require companion evidence such as
  `nip05-resolution`, `https-probe`, and `dns-owner-check` before accepting a
  provider-trust score, and resolver helpers now derive that evidence from
  NIP-05 documents, HTTPS probe output, DNS owner checks, and fixture-tested
  collectors for NIP-05 documents plus HTTPS probes.
- Additional resolver examples for LNURLp, NIP-96, and service-specific probes.
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

- Signed deployment policies can now require companion evidence such as
  `list-revision-fetch`, `sample-review`, and `correction-channel` before
  accepting a curation-source score, and resolver helpers now derive that
  evidence from the fetched list event, sampling workflow, correction channel
  probe, and a fixture-tested relay fetch adapter for addressable events.
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

### Anonymous group decisions, voting, and petitions

Current state: a NEW pattern dimension, not a new subject. Every shipped use case
scores a subject; the same circle + LSAG + key-image machinery also tallies a
*decision*. The one-vote-per-member tally already works: `{ aggregate: 'sum' }`
over a `rank` ballot via `aggregateEventContributions`, with duplicate key images
rejected and `verifyProof` reporting `distinctSigners` as turnout. The summed
`rank` is validated as 0–100, so the sum tally is bounded to small electorates
(≤100 ayes); petitions instead count distinct signatories with `distinctSigners`,
bounded only by the ring size. Multi-choice and ranked/score (Borda) ballots do
NOT work yet — custom per-option metric keys fail strict validation, and bounded
multi-vote needs a k-LRS construction. The worked page is at
[anonymous-group-decisions.md](../use-case-pages/anonymous-group-decisions.md).

What must exist before promotion:

- A ballot/motion event format: option encoding, abstentions, tie-breaks, ranked
  and score layout across metric keys.
- A coercion-resistance decision. LSAG alone is NOT receipt-free — a voter can
  prove how they voted — so decide which target decisions need receipt-freeness
  and which companion protocol or coordinator (e.g. MACI-style) provides it.
- Failure handling for replayed, wrong-motion, and late ballots, plus quorum
  failure, all failing closed.
- A worked example, adversarial tests, live relay evidence, a `USE_CASE_PROFILES`
  entry, and a canonical motion-subject helper.

Likely nostr-veil work:

- Keep the NIP-85 aggregate event as the tally carrier; no new event shape.
- Add a ballot-encoding helper and a motion-subject canonicaliser only after the
  ballot format is fixed.
- Document the coercion-resistance boundary prominently rather than papering over
  it.

Do not claim publicly yet:

- That nostr-veil is a voting system, or that ballots are secret (values are
  public-but-anonymous; small or lopsided electorates leak the distribution).
- That it is receipt-free or coercion-resistant.
- That it supports weighted or cumulative multi-vote rules. Those need a
  k-linkable ring signature (k-LRS, IACR 2025/243) construction the current
  `@forgesworn/ring-sig` primitive does not implement — the single highest-
  leverage build/no-build question for this candidate.

### Healthcare clinician peer-rating (FPPE)

Current state: the one new VERTICAL the 2026-06-23 research surfaced with hard,
current primary-source demand. Hospital Focused Professional Practice Evaluation
(FPPE) anonymous reporting is documented as "weaponised" because nobody can tell
many distinct reviewers from one recurring accuser ("there is no numerator or
denominator"; Moore et al., Cureus 2025). A verifiable count of N distinct,
linkable, one-vote-per-member contributors is exactly the missing signal.

What must be resolved before any public healthcare positioning:

- The medico-legal model: peer-review privilege and due-process rights of the
  accused may DEMAND auditable de-anonymisation — the opposite of nostr-veil's
  never-de-anonymising guarantee. The surveyed surgeons themselves leaned toward
  removing anonymity for accountability, so the "accountable anonymity" fit is an
  analyst inference from a documented failure, not a recommendation in the source.
- Circle enrolment and key distribution: who curates the credentialled-peer
  circle, and how that survives HIPAA and hospital governance.

Do not claim publicly yet: any healthcare positioning, until the due-process and
enrolment models are resolved. This is vertical research, not a shipped profile.

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
