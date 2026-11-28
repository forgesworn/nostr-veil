# Examples

Runnable examples for nostr-veil. The top-level scripts are self-contained;
`examples/use-cases.ts` runs the canonical use-case snippets published on the
demo site.

## Run

```bash
npx tsx examples/basic-circle.ts
npx tsx examples/partial-threshold.ts
npx tsx examples/nip85-provider.ts
npx tsx examples/typed-assertions.ts
npx tsx examples/use-cases.ts
npm run test:production-recipes
npm run test:companion-evidence
npm run test:admission-gate
npm run test:in-room-flags
npm run test:admission-gate:relay -- --dry-run
npm run test:use-cases:relay -- --dry-run
```

Requires [tsx](https://github.com/privatenumber/tsx) (`npx tsx` works without installing).

`typed-assertions.ts` uses opt-in proof v2 for event, addressable, and identifier assertions.

`use-cases.ts` imports one executable file per use case from
`examples/use-cases/`. The generated detail pages in `demo/public/use-cases/`
render those same files, so the public snippets drift only when the executable
examples drift.

The live relay harness also runs the fetched events through the built-in
`verifyUseCaseProfile()` verifier, using the example circles as the accepted
circle IDs. That keeps the public relay evidence aligned with the safer
deployment API, not only the low-level proof verifier.

`production-recipes.ts` shows production-shaped verifier gates using
`createCircleManifest()`, `createDeploymentPolicy()`,
`createSignedDeploymentBundle()`, and `verifyProductionDeployment()`: package
release reputation, relay preference, NIP-05/domain trust, federated moderation
review, list/labeler selection, and relay/community admission. The recipes run
`validateUseCaseProfileDefinition()` before building each deployment policy, so
custom profile mistakes are caught before a score drives automation. The recipes
use stable issue codes for audit/error handling. Production apps can pass those codes to
`explainVerificationIssue()` or `remediationForIssue()` to show the corrective
operator action, or use `verifyProductionDeploymentReport()` when they need the
decision, control status, and remediation text in one object. The recipes also
model companion evidence for off-chain checks: package provenance/SBOM/feed
checks, NIP-05/DNS/HTTPS checks, and list revision/sample/correction checks.
Those examples use the collector helpers so evidence is derived from fixture
fetches, DNS callbacks, relay/list observations, and correction probes instead
of static pass records. They use NIP-85 kind names such as "kind 30385
identifier assertion" so the subject route is explicit.

`companion-evidence-live.ts` is the dedicated smoke test for those collectors.
`npm run test:companion-evidence` uses deterministic fixtures and can refresh
`docs/companion-evidence-checks.json`. `npm run test:companion-evidence:live`
uses live npm/OSV/NIP-05/HTTPS/relay I/O; package release checks intentionally
fail closed unless npm exposes trusted-publishing provenance and an SBOM URL is
supplied.

`admission-gate.ts` shows the additive relay/community admission pattern. The
vouch remains a normal NIP-85 kind 30382 user assertion with `veil-*` proof
tags. The admission challenge and applicant presentation are separate protocol
objects verified by `verifyAdmissionRequest()` alongside the signed deployment
bundle.

`admission-gate-relay.ts` is the live version of the same gate. It publishes
the signed kind 30382 admission vouch to the relay, carries the signed
nostr-veil deployment bundle in a separate NIP-78 kind 30078 application data
event, fetches both back by id, and then runs `verifyAdmissionRequest()` against
the fetched material. Kind 30078 is only a transport wrapper for this example;
it is not a new NIP-85 assertion kind.

`in-room-flags.ts` shows anonymous flags inside a private room. The room's
roster is the trust circle. Each flag is a one-signer veil event about the
flagged message, sealed to the room key and posted under a throwaway key, and
every member's client counts the distinct flaggers itself, so there is no
aggregator and the roster never reaches a relay in the clear. A reader verifies
each flag once and counts the key images that verify, passing over any
envelope that fails or cannot be read, so one cannot spoil or stop the count.
A flag must carry one signature, made under the room's election id for the
message: a circle's id leaves out its scope, so a flag signed under another
scope would carry a key image of its own. Each reader pins the flag's bound,
`rank` of exactly 1 and `required`, so a flag that leaves the metric out is
rejected, and pins the `median` aggregate and the event kind. The script stands in for the host app's encryption and
transport, and its header lists what a real app has to provide and what no code
removes. It is a building block, not a profile.

The built-in profiles also expose `proofClaims`, `proofLimitations`,
`requiredControls`, and `recommendedActions`. Use those fields when rendering a
production decision so the UI says what the proof supports and which real-world
checks still have to run.

When adding a custom use-case profile, run
`validateUseCaseProfileDefinition(profile)` in the same test suite. It catches
NIP-85 kind/tag mismatches, unsupported metrics, missing safety metadata, and
warnings where a profile may overclaim or omit real-world controls.

For real deployments, canonicalise subjects before signing. The profile helpers
cover relays, service endpoints, NIP-05, domains, LNURLp, NIP-96, npm packages,
package artefact digests, git repositories, GitHub repositories, maintainers,
vendors, and sources, so reviewers and verifiers do not accidentally split the
same real-world thing across several strings.

`use-cases-relay.ts` is an opt-in live relay check. It signs every canonical
use-case example as a Nostr event, publishes the events to
`wss://relay.primal.net`, fetches them back by id, and verifies the fetched
events again. Use `--dry-run` to check signing and proof verification without
network publication. To refresh the public evidence file:

```bash
npm run test:use-cases:relay -- --write docs/use-case-relay-checks.json
```

To refresh the relay-backed admission gate evidence:

```bash
npm run test:admission-gate:relay -- --write docs/admission-gate-relay-check.json
```

To refresh the companion-evidence smoke-test report:

```bash
npm run test:companion-evidence -- --write docs/companion-evidence-checks.json
```
