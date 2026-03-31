## [0.2.1](https://github.com/forgesworn/nostr-veil/compare/v0.2.0...v0.2.1) (2026-03-31)


### Bug Fixes

* add registry-url to release job for OIDC publishing ([ad3b8bc](https://github.com/forgesworn/nostr-veil/commit/ad3b8bca36e0a064ce33f0ba854fd424f6f86c7b))

# [0.2.0](https://github.com/forgesworn/nostr-veil/compare/v0.1.0...v0.2.0) (2026-03-31)


### Bug Fixes

* add prepare script for git URL installs ([10d6953](https://github.com/forgesworn/nostr-veil/commit/10d6953696405d8da4ddbbfd86e9252e0191032f))
* add prepare script for git URL installs ([d971074](https://github.com/forgesworn/nostr-veil/commit/d971074d81bf30c6aa4e8556870048b401bb48f5))
* increase integration test timeout for 5-member LSAG signing ([3e1ee56](https://github.com/forgesworn/nostr-veil/commit/3e1ee5632511a7469fe579b76d0a856883d78ec7))
* narrate waits for clip duration to keep video and audio in sync ([440471d](https://github.com/forgesworn/nostr-veil/commit/440471d3df5ef9b46548fd23650c19af504c383f))
* re-review findings — electionId bypass, test coverage, type fix ([cedb94c](https://github.com/forgesworn/nostr-veil/commit/cedb94ccdd8515a91e230931f16b9c5a35b3d0cd))
* reject unsorted rings, missing d-tag, and missing veil-threshold ([931a018](https://github.com/forgesworn/nostr-veil/commit/931a0182f2e61c6c3a7a940725270d9576397e67))
* remove .DS_Store from tracking ([b38fd51](https://github.com/forgesworn/nostr-veil/commit/b38fd513666ddede6755fa4a4df283af3305ec90))
* remove confusing placeholder text from veil event JSON ([c43fdee](https://github.com/forgesworn/nostr-veil/commit/c43fdee00f73e53d716e7d9417a2cf7adb955067))
* remove pubkey/id/sig from veil event display, not part of demo flow ([f0c2a45](https://github.com/forgesworn/nostr-veil/commit/f0c2a458d7101ac63ece3f41fb0bf151c394f3af))
* remove stale aliases and docs referencing deleted modules ([b9e6768](https://github.com/forgesworn/nostr-veil/commit/b9e67685b496351e0e2004e2ae5380b0ffc59552))
* replace removed nostr-veil/graph import with local demo utility ([bcac891](https://github.com/forgesworn/nostr-veil/commit/bcac8912ac41884295869907e1e1ec86b2973984))
* revert veil_ tags to veil- (namespaced extension, not NIP-85 metrics) ([f252fd3](https://github.com/forgesworn/nostr-veil/commit/f252fd3486c478bb42ce373834621a6ef107cd59))
* security audit — serialiseSig replacer, DoS bounds, key lifecycle, JSON safety, CI pinning, protocol version ([a431a5c](https://github.com/forgesworn/nostr-veil/commit/a431a5cc3366ba103ae89017d7836493b41724cd))
* security audit findings — transplant attack, input validation, CI pinning ([0c2ce6f](https://github.com/forgesworn/nostr-veil/commit/0c2ce6f421dbe498118743fb4d76d94e19f79389))
* ticker shows real-time events only, no pre-loaded noise ([ec6d268](https://github.com/forgesworn/nostr-veil/commit/ec6d26835ca9a1e2e672f44f7c4de348cf50dc2b))
* update recording selectors for 6-screen flow, h264 encoding for MP4 output ([1ca3e25](https://github.com/forgesworn/nostr-veil/commit/1ca3e259098ed997c63a6e5133172d160fdef3fb))


### Features

* add semantic-release, upgrade CI, and add GitHub Pages workflow ([9627f02](https://github.com/forgesworn/nostr-veil/commit/9627f022b3ce7e04187216de6d41220251cf5a65))
* add trust graph scorer, duress monitoring, and CLI ([a5832dd](https://github.com/forgesworn/nostr-veil/commit/a5832dd4797a1b469f91dbaa8ba0c8bc278428a3))
* demo video recording infrastructure (Playwright + OpenAI TTS + ffmpeg) ([055e75a](https://github.com/forgesworn/nostr-veil/commit/055e75a50b2d8b6c59a0cd91a8c4d19a9495e63e))
* drop noble compat shim — ring-sig v2 uses noble v2 natively ([135ccac](https://github.com/forgesworn/nostr-veil/commit/135ccac4208994c29b4d66b9b91521b5d7131107))
* WoT-a-thon remaining tasks (scorer, duress, CLI, demo overhaul, tests) ([9f37aba](https://github.com/forgesworn/nostr-veil/commit/9f37aba607dea184e1a94910d424e2d61c9bb307))

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
