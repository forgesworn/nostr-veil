# CLAUDE.md -- nostr-veil

## What this project is

Anonymous trust assertions for Nostr. Layers LSAG ring-signature anonymity onto NIP-85 trusted assertions so trust scores are verifiable without exposing who contributed them.

## Architecture

Two layers, each a subpath export:

- **`src/nip85/`** -- NIP-85 foundation. Builders, parsers, validators, and relay filters for kinds 30382-30385 and 10040.
- **`src/proof/`** -- Ring-signature proof layer. Trust circles, anonymous contributions via LSAG, aggregation (default: median), and verification.

Supporting files:
- `src/signing.ts` -- Schnorr event signing (NIP-01 serialisation)

## Build, test, lint

```bash
npm run build    # tsc -p tsconfig.build.json
npm test         # vitest run (118 tests across 11 files)
npm run lint     # tsc --noEmit (type-checking only)
npm run demo     # Vite dev server for the interactive demo
```

## Dependencies

Runtime:
- `@forgesworn/ring-sig` -- SAG/LSAG ring signatures on secp256k1
- `@noble/curves`, `@noble/hashes` -- Elliptic curve and hash primitives

Dev only: `typescript`, `vitest`

## Code conventions

- British English (licence, serialise, initialise)
- ESM only (`"type": "module"` in package.json)
- All imports use `.js` extensions (TypeScript ESM convention)
- Types live in `types.ts` within each module directory
- Tests mirror source structure: `test/nip85/`, `test/proof/`
- Commit messages: `type: description` (e.g. `feat:`, `fix:`, `docs:`)

## Key types

- `TrustCircle` -- sorted member pubkeys + SHA-256 circle ID
- `Contribution` -- LSAG-signed metrics with key image
- `ProofVerification` -- result of `verifyProof()`: valid, circleSize, threshold, distinctSigners, errors
- `EventTemplate` -- unsigned Nostr event (kind, tags, content)

## Dependency relationships

```
nostr-veil/nip85  (standalone -- no deps on proof layer)
nostr-veil/proof  (depends on nip85 for EventTemplate + NIP85_KINDS)
src/signing.ts    (standalone -- used by integration tests and consumers)
```

The proof layer imports from nip85 but not the other way around.

## Companion libraries (not dependencies)

These libraries complement nostr-veil but are independently maintained:
- `nsec-tree` -- Sub-identity derivation for compartmentalised trust circle personas
- `canary-kit` -- Coercion-resistant verification and duress detection
- `signet` -- Decentralised identity verification
- `dominion` -- Epoch-based encrypted content access

## Common pitfalls

- `contributeAssertion` requires the member's index in the circle (0-based, matching the sorted pubkey order). Getting this wrong produces an invalid signature.
- `aggregateContributions` validates all LSAG signatures before aggregating. If any signature is invalid, it throws rather than silently dropping the contribution.
- The demo is a separate Vite app in `demo/` with its own `package.json` and `node_modules`.
- Noble v2 requires `Uint8Array` not hex strings. If you call `schnorr.getPublicKey()` or `schnorr.sign()` directly, convert with `hexToBytes()` first. The `signEvent` utility handles this internally.
