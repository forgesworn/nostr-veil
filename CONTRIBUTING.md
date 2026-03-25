# Contributing to nostr-veil

## Setup

```bash
git clone https://github.com/forgesworn/nostr-veil.git
cd nostr-veil
npm install
npm run build
npm test
```

## Development

```bash
npm test          # run all tests once
npm run test:watch # watch mode
npm run lint      # type-check only (no emit)
npm run demo      # start the interactive demo (Vite dev server)
```

The demo is a separate Vite app in `demo/` with its own `package.json`. Run `cd demo && npm install` if it hasn't been set up.

## Project structure

- `src/nip85/` — NIP-85 event builders, parsers, validators, filters
- `src/proof/` — LSAG ring-signature trust circles, contributions, aggregation, verification
- `src/identity/` — nsec-tree provider trees, personas, disclosure proofs
- `src/signing.ts` — BIP-340 Schnorr event signing
- `test/` — mirrors `src/` structure
- `demo/` — Vite + React interactive demo

## Conventions

- **British English** — licence, serialise, initialise, behaviour
- **ESM only** — `.js` extensions in all local imports
- **TDD** — write the failing test first, then the implementation
- **Commits** — `type: description` format (e.g. `feat:`, `fix:`, `docs:`, `test:`)

## Testing

Tests use [Vitest](https://vitest.dev/). Each module has its own test file mirroring the source path:

```
src/proof/circle.ts  →  test/proof/circle.test.ts
```

Run a single test file:
```bash
npx vitest run test/proof/circle.test.ts
```

## Pull requests

1. Fork and create a branch from `main`
2. Write tests for any new functionality
3. Ensure `npm test` and `npm run build` pass
4. Keep commits focused — one logical change per commit
5. Open a PR with a clear description of what and why

## Licence

By contributing you agree your contributions will be licensed under MIT.
