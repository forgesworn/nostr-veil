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
review, and relay/community admission. The recipes use stable issue codes for
audit/error handling, and NIP-85 kind names such as "kind 30385 identifier
assertion" so the subject route is explicit.

`use-cases-relay.ts` is an opt-in live relay check. It signs every canonical
use-case example as a Nostr event, publishes the events to
`wss://relay.trotters.cc`, fetches them back by id, and verifies the fetched
events again. Use `--dry-run` to check signing and proof verification without
network publication. To refresh the public evidence file:

```bash
npm run test:use-cases:relay -- --write docs/use-case-relay-checks.json
```
