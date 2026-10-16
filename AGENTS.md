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
- `ProofVerification` -- result of `verifyProof()`: valid, circleSize, threshold, distinctSigners, errors
- `EventTemplate` -- unsigned Nostr event (kind, tags, content)

## Companion libraries (not dependencies)

These libraries complement nostr-veil but are independently maintained:
- `nsec-tree` -- sub-identity derivation for compartmentalised trust circle personas
- `canary-kit` -- coercion-resistant verification and duress detection
- `signet` -- decentralised identity verification
- `dominion` -- epoch-based encrypted content access

## Pitfalls

- Noble v2 requires `Uint8Array`, not hex strings. Use `hexToBytes()` before direct noble calls; `signEvent` handles this internally. The reverse holds for nostr-veil's own API: pubkeys and every `privateKey` argument (`contributeAssertion`, `signEvent`, `createSignedDeploymentBundle`) are 64-char lowercase hex strings, and a `Uint8Array` is rejected. Convert noble's byte keys with `bytesToHex()`.
- v1 proofs are not kind-bound: a valid v1 proof verifies under any NIP-85 kind sharing the same d-tag. Pass `expectedKind` to `verifyProof` (or require v2) when consuming them. The CLI exposes this as `nostr-veil verify <json> --kind <n>`.
- Profiles verifiers are fail closed on freshness: `verifyCircleManifest`, `verifySignedDeploymentBundle` and `verifyAdmissionPresentation` default `now` to the current time, so expired manifests/bundles/challenges are rejected unless `now` is passed explicitly.
- `contributeAssertion` needs the member's 0-based index in `circle.members` (sorted order). Use `circle.members.indexOf(pubkey)`. A wrong index throws `Private key does not match ring member at signerIndex` rather than producing a signature.
- Named aggregates (`{ aggregate: 'sum' }` and the others) are recorded in the `veil-agg` tag and `verifyProof` reads them from it, so no verifier option is needed. Only a custom `aggregateFn` (recorded as `veil-agg: custom`) must also be passed to `verifyProof`.
- The `nostr-veil` root re-exports `nip85`, `proof` and `profiles` and adds the signing helpers (`signEvent`, `verifySignedEvent`, `computeEventId`), which are not available from any subpath.
- `aggregateContributions` validates all LSAG signatures before aggregating; if any signature is invalid it throws rather than silently dropping the contribution.
- The demo app is separate (`demo/` with its own `package.json`).
