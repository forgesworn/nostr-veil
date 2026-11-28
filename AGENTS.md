# AGENTS.md -- nostr-veil

Anonymous trust assertions for Nostr. Layers LSAG ring-signature anonymity onto NIP-85 trusted assertions so trust scores are verifiable without exposing who contributed them.

## Quick reference

```bash
npm run build     # tsc -p tsconfig.build.json
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run lint      # tsc --noEmit (type-checking only)
npm run demo      # Vite dev server for the interactive demo
```

## Architecture

Three subpath exports, each a layer:

- `src/nip85/` -- NIP-85 foundation. Builders, parsers, validators and relay filters for kinds 30382-30385 and 10040.
- `src/proof/` -- LSAG ring-signature proof layer: trust circles, anonymous contributions, aggregation (default: median), verification.
- `src/profiles/` -- Higher-level profiles built on the proof layer: circle manifests, deployment bundles, admission presentations, evidence and policy.
- `src/signing.ts` -- BIP-340 Schnorr event signing (NIP-01 serialisation).

Tests mirror source: `test/nip85/`, `test/proof/`, `test/profiles/`, `test/integration.test.ts`.

Dependency relationships:

```
nostr-veil/nip85     (standalone -- no dependency on the proof layer)
nostr-veil/proof      (depends on nip85 for EventTemplate + NIP85_KINDS)
nostr-veil/profiles   (depends on proof)
src/signing.ts        (standalone -- used by integration tests and consumers)
```

The proof layer imports from nip85 but not the other way around.

## Conventions

- British English (licence, serialise, initialise)
- ESM only, `.js` extensions in local imports
- Types in `types.ts` within each module directory
- Commits: `type: description` (feat, fix, docs, test, refactor)
- TDD: write failing test first

## Key types

- `TrustCircle` -- sorted member pubkeys + SHA-256 circle ID
- `Contribution` -- LSAG-signed metrics with key image
- `ProofVerification` -- result of `verifyProof()`: valid, circleSize, threshold, distinctSigners, subjectInRing, independentSigners, errors
- `EventTemplate` -- unsigned Nostr event (kind, tags, content)

## Companion libraries (not dependencies)

These libraries complement nostr-veil but are independently maintained:
- `nsec-tree` -- sub-identity derivation for compartmentalised trust circle personas
- `canary-kit` -- coercion-resistant verification and duress detection
- `signet` -- decentralised identity verification
- `dominion` -- epoch-based encrypted content access

## Pitfalls

- Noble v2 requires `Uint8Array`, not hex strings. Use `hexToBytes()` before direct noble calls; `signEvent` handles this internally. The reverse holds for nostr-veil's own API: pubkeys and every `privateKey` argument (`contributeAssertion`, `signEvent`, `createSignedDeploymentBundle`) are 64-char lowercase hex strings, and a `Uint8Array` is rejected. Convert noble's byte keys with `bytesToHex()`.
- v1 proofs are not kind-bound: a valid v1 proof verifies under any of the four NIP-85 assertion kinds (30382-30385) sharing the same d-tag. `verifyProof` rejects every other kind outright, but within those four you must pass `expectedKind` (or require v2) to pin the one you mean. A proof that verifies says nothing about who is in the ring: anyone can build one, so check the circle is one you trust. The CLI exposes this as `nostr-veil verify <json> --kind <n>`.
- Profiles verifiers are fail closed on freshness: `verifyCircleManifest`, `verifySignedDeploymentBundle` and `verifyAdmissionPresentation` default `now` to the current time, so expired manifests/bundles/challenges are rejected unless `now` is passed explicitly. A `now` that cannot be compared (`NaN`, a word) is reported as `now must be a Unix timestamp` and no time check runs; a numeric string or a fraction is read as the time.
- Where the subject of a proof is a ring member (in practice a kind 30382 pubkey), one valid signature may be the subject's own. `independentSigners` sets it aside, and the profile verifiers hold `minDistinctSigners` to it for a proof that verifies, so a proof about a member needs one signer more than the threshold; a bare `verifyProof` only reports it, unless `rejectSubjectInRing` is passed. The subject's contribution stays in the score either way: only `rejectSubjectInRing`, which rejects such a proof outright, keeps it out of what is accepted. `subjectInRing` and the builders' self-assertion guard compare the subject in lower case, as a pubkey is the same key in any case.
- `contributeAssertion` needs the member's 0-based index in `circle.members` (sorted order). Use `circle.members.indexOf(pubkey)`. A wrong index throws `Private key does not match ring member at signerIndex` rather than producing a signature. That holds for the helpers that take a private key. The `*Async` helpers hand the index to the `LsagSigner` and cannot check it, because a ring signature hides who signed, so whether a wrong index throws is up to the signer.
- Named aggregates (`{ aggregate: 'sum' }` and the others) are recorded in the `veil-agg` tag and `verifyProof` reads them from it, so no verifier option is needed. Only a custom `aggregateFn` (recorded as `veil-agg: custom`) must also be passed to `verifyProof`.
- The publisher chooses `veil-agg` and the circle does not sign it: the same signatures republished as a `max` or a `min` pass a bare `verifyProof`. Pass `requireAggregate`; the built-in profiles pin it (`median`, `sum` for the tally profile). The CLI exposes this as `nostr-veil verify <json> --aggregate <fn>`. A key image stops a second contribution, not one large value, so under `sum`, `mean`, `min` or `max` also pass `contributionBounds`. A member who leaves a metric out still counts as a signer unless its bound sets `required: true` (the tally profile does).
- `metricPolicies` in a deployment policy bound the published aggregate. `contributionBounds` bound what one member may sign. They are different checks.
- A proof does not say who published it or when. The ring signatures are public and carry no time, so anyone can republish a subset of them, or an old proof under a new `created_at`, with their own key. A deployment policy stops third parties doing that with `acceptedPublishers`, which also forces the Nostr signature check. It is not `trustedPublishers`, which names who may sign a bundle.
- The `nostr-veil` root re-exports `nip85`, `proof` and `profiles` and adds the signing helpers (`signEvent`, `verifySignedEvent`, `computeEventId`), which are not available from any subpath.
- Every verifier bounds what it reads of an event. Under the default `limits`, more than 1,200 tags, a tag name over 64 characters (other than one beginning `veil-`, which no check reads) or a `d` tag over 512 is turned away before any check reads its tags: one error from `verifyProof`, and `event.limit_exceeded` in the profiles layer, where none of the event's metrics is read and the report fails its circle, profile, proof and metric controls. `maxTagCount` follows `maxRingSize` unless given, so raising the ring limit raises it too, and it is not in `DEFAULT_VERIFY_LIMITS`. A proof's signatures, distinct metric names and fixed tags must together be within it, which a proof whose members sign different metric names can pass. Each limit must be a non-negative number (`Infinity` lifts it). Any other value, such as `NaN` or a string, fails closed: `verifyProof` fails the proof, and the profiles layer reports `verification.limits_invalid` and checks no event beyond its Nostr signature. Unknown `veil-*` tags are still ignored, but count towards the tag limit.
- `aggregateContributions` validates all LSAG signatures before aggregating; if any signature is invalid it throws rather than silently dropping the contribution.
- `verifyDeploymentBundle` and the verifiers built on it apply a bundle's policy only when the bundle is authentic: validly signed by a key in `trustedPublishers`. For any other bundle `deployment` is a rejection with no findings, the report's policy controls read `not-checked`, and its profile summary is blank; `deployment.policy` still holds the policy as the bundle gave it, unchecked. Read `decision` on the result, not `deployment.decision`.
- Events, bundles and admission presentations can come from anyone. A malformed event, or a malformed bundle that is not authentic, is rejected with an issue code such as `nip85.syntax_invalid`, and a malformed presentation is denied with an error that carries no issue code; verifiers do not throw on any of them. The policy of an authentic bundle is still JSON: each field the verifier reads must be absent or of its type, and `null` is not absent. One that is not is reported as `policy.field_invalid`, `profile.field_invalid` or `circle.manifest_field_invalid`, with a `path` naming it, nothing else in the policy is checked, and the report's policy controls read `not-checked`. A value with a check of its own, such as a time window, the signer threshold, a metric bound or the accepted publishers, keeps its own code, and the run goes on. Not covered: the verifier's own options, and `parseAssertion` and `parseProviderDeclaration`, which are parsers and do throw, so validate first.
- A verification result holds its input as given, including the events, the bundle (`bundle.bundle`), its policy (`deployment.policy`) and profile (`deployment.profileVerification.profile`). For an admission request the same sit under `deployment`, beside the presentation's fields, such as `applicantPubkey` and `audience`. A value from anyone can be nested too deep for `JSON.stringify` to write, so write a result out with a serialiser that copes with deep values, or store the decision report instead. Build a report from the result as the verifier returned it, since one built from a pruned result can misread its controls. The report gives the bundle's own fields only where they have their type.
- Read issue codes from `issues` on a verification result. Each code is given where its error is raised, so text inside an event cannot change it. `classifyVerificationError` and `issuesFromErrors` read a code out of a message's words, and a message quotes tag names and kinds from the event: keep them for strings that come with no `issues`, such as an old log.
- The demo app is separate (`demo/` with its own `package.json`).
