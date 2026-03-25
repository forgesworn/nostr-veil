# Changelog

All notable changes to nostr-veil are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-03-25

### Added

- **NIP-85 foundation layer** (`nostr-veil/nip85`)
  - Builders for kinds 30382 (user assertions) and 10040 (provider declarations)
  - Parsers, validators, and relay query filters
  - Kind-specific metric types matching the NIP-85 spec

- **Proof layer** (`nostr-veil/proof`)
  - `createTrustCircle` — sorted member ring with SHA-256 circle ID
  - `contributeAssertion` — LSAG ring-signed anonymous contributions
  - `aggregateContributions` — threshold consensus with median aggregation
  - `verifyProof` — LSAG signature and key image verification
  - Canonical JSON message format for deterministic cross-platform signing

- **Identity layer** (`nostr-veil/identity`)
  - `createProviderTree` — nsec-tree derived per-algorithm provider keys
  - `createUserPersona` — compartmentalised user personas
  - `proveCommonOwnership` — blind/full linkage proofs between identities
  - `buildDisclosureEvent` — kind 30078 disclosure events

- **Signing utility** — BIP-340 Schnorr event signing with NIP-01 serialisation
- **Interactive demo** — 5-screen whistleblower scenario (Vite + React)
- **100 tests** across 13 test files
- CI via GitHub Actions

[0.1.0]: https://github.com/forgesworn/nostr-veil/releases/tag/v0.1.0
