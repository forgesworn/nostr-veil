# AGENTS.md -- nostr-veil

Generic AI agent instructions. See also: [CLAUDE.md](./CLAUDE.md) for Claude-specific details.

## Quick reference

```bash
npm run build    # tsc -p tsconfig.build.json
npm test         # vitest run (100 tests across 13 files)
npm run lint     # tsc --noEmit
npm run demo     # Vite dev server for demo app
```

## Architecture

Three layers, each a subpath export:

- `src/nip85/` -- NIP-85 foundation (kinds 30382-30385, 10040)
- `src/proof/` -- LSAG ring-signature proof layer (trust circles, contributions, aggregation, verification)
- `src/identity/` -- nsec-tree sub-identity compartmentalisation (personas, provider trees, disclosure proofs)
- `src/signing.ts` -- BIP-340 Schnorr event signing

Tests mirror source: `test/nip85/`, `test/proof/`, `test/identity/`, `test/integration.test.ts`

## Conventions

- British English (licence, serialise, initialise)
- ESM only, `.js` extensions in local imports
- Types in `types.ts` within each module directory
- Commits: `type: description` (feat, fix, docs, test, refactor)
- TDD: write failing test first

## Key types

- `TrustCircle` -- sorted member pubkeys + SHA-256 circle ID
- `Contribution` -- LSAG-signed attestation with key image and metrics
- `ProofVerification` -- result of verifyProof(): valid, circleSize, threshold, distinctSigners, errors
- `EventTemplate` -- unsigned Nostr event (kind, tags, content)

## Pitfalls

- Noble v2 requires `Uint8Array`, not hex strings. Use `hexToBytes()` before noble calls.
- `contributeAssertion` needs the member's 0-based index in `circle.members` (sorted order).
- The demo app is separate (`demo/` with its own package.json).
