# CLAUDE.md -- nostr-veil

## What this project is

Privacy-preserving Web of Trust for Nostr. Layers LSAG ring-signature anonymity onto NIP-85 trusted assertions so trust scores are verifiable without exposing who contributed them.

## Architecture

Three layers, each a subpath export:

- **`src/nip85/`** -- NIP-85 foundation. Builders, parsers, validators, and relay filters for kinds 30382-30385 and 10040.
- **`src/proof/`** -- Ring-signature proof layer. Trust circles, anonymous contributions via LSAG, aggregation (default: median), and verification.
- **`src/identity/`** -- Sub-identity compartmentalisation. nsec-tree persona derivation, provider trees, and common-ownership disclosure proofs.

Supporting files:
- `src/signing.ts` -- Schnorr event signing (NIP-01 serialisation)
- `src/_noble-compat.ts` -- Compatibility shim for @noble/curves v2

## Build, test, lint

```bash
npm run build    # tsc -p tsconfig.build.json
npm test         # vitest run (94 tests across 13 files)
npm run lint     # tsc --noEmit (type-checking only)
npm run demo     # Vite dev server for the interactive demo
```

## Dependencies

Runtime:
- `@forgesworn/ring-sig` -- SAG/LSAG ring signatures on secp256k1
- `nostr-attestations` -- NIP-VA kind 31000 verifiable attestations
- `nsec-tree` -- Deterministic Nostr sub-identity derivation
- `@noble/curves`, `@noble/hashes` -- Elliptic curve and hash primitives

Dev only: `typescript`, `vitest`

## Code conventions

- British English (licence, serialise, initialise)
- ESM only (`"type": "module"` in package.json)
- All imports use `.js` extensions (TypeScript ESM convention)
- Types live in `types.ts` within each module directory
- Tests mirror source structure: `test/nip85/`, `test/proof/`, `test/identity/`
- Commit messages: `type: description` (e.g. `feat:`, `fix:`, `docs:`)

## Key types

- `TrustCircle` -- sorted member pubkeys + SHA-256 circle ID
- `Contribution` -- LSAG-signed attestation with key image and metrics
- `ProofVerification` -- result of `verifyProof()`: valid, circleSize, threshold, distinctSigners, errors
- `EventTemplate` -- unsigned Nostr event (kind, tags, content)

## Common pitfalls

- The `_noble-compat.ts` shim exists because @noble/curves v2 changed its API. The vitest config aliases `@noble/curves/secp256k1` through this shim -- do not remove the alias without updating all call sites.
- `contributeAssertion` requires the member's index in the circle (0-based, matching the sorted pubkey order). Getting this wrong produces an invalid signature.
- `aggregateContributions` validates all LSAG signatures before aggregating. If any signature is invalid, it throws rather than silently dropping the contribution.
- The demo is a separate Vite app in `demo/` with its own `package.json` and `node_modules`.
