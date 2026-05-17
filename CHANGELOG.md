## 0.14.0 (2026-05-17)


### Features

* add opt-in proof v2 semantic binding for assertion kind and subject hint tags
* add typed contribution helpers for event, addressable, and identifier assertions
* add strict provider declaration validation for kind 10040


### Security

* harden `verifyProof` with signature payload, signed message, metric count, and metric name limits
* allow applications to require proof v2 with `verifyProof(event, { requireProofVersion: 'v2' })`


### Documentation

* document proof v2 as backwards-compatible and opt-in
* expand use-case guidance for package, domain, service-provider, labeler, moderation-list, credential, and admission workflows

## 0.12.1 (2026-05-16)


### Chore

* migrate the release pipeline from semantic-release to anvil
* first npm publish via anvil OIDC trusted publishing; no library code change since 0.12.0

# [0.12.0](https://github.com/forgesworn/nostr-veil/compare/v0.11.0...v0.12.0) (2026-05-16)

## 0.19.1 (2026-05-17)

### Bug Fixes

- keep verifier issue fields additive



## 0.19.0 (2026-05-17)

### Features

- add production deployment verifier



## 0.18.0 (2026-05-17)

### Features

- add signed deployment bundles



## 0.17.0 (2026-05-17)

### Features

- add circle manifests



## 0.16.0 (2026-05-17)

### Features

- add deployment policy recipes



## 0.15.0 (2026-05-17)

### Features

- add deployment use-case profiles



### Features

* add verifyFederation for cross-circle deduplication ([#15](https://github.com/forgesworn/nostr-veil/issues/15)) ([42e71c5](https://github.com/forgesworn/nostr-veil/commit/42e71c57b9e291115dccdf187271e67e75cbeb5f))

# [0.11.0](https://github.com/forgesworn/nostr-veil/compare/v0.10.0...v0.11.0) (2026-05-16)


### Features

* cross-circle deduplication via federation scope ([8f11f93](https://github.com/forgesworn/nostr-veil/commit/8f11f939d572cd530321c679e044cd835306028c))

# [0.10.0](https://github.com/forgesworn/nostr-veil/compare/v0.9.1...v0.10.0) (2026-05-15)


### Features

* add named aggregate functions and the veil-agg tag ([f615bcb](https://github.com/forgesworn/nostr-veil/commit/f615bcbdb12bb4f493b3b2a935efd6b380e3dcb1))
* verify the whole assertion, not just the ring signatures ([4d71d0e](https://github.com/forgesworn/nostr-veil/commit/4d71d0e181f74b1bb607324493d8b9dde610814f))

## [0.9.1](https://github.com/forgesworn/nostr-veil/compare/v0.9.0...v0.9.1) (2026-04-16)


### Bug Fixes

* allow reveal attestation without heartwood signer ([0739c8f](https://github.com/forgesworn/nostr-veil/commit/0739c8f1c748b4fcc9998e730b564bbafb36c9b0))

# [0.9.0](https://github.com/forgesworn/nostr-veil/compare/v0.8.4...v0.9.0) (2026-04-16)


### Bug Fixes

* downgrade key mismatch to warning in heartwood mode ([cf7882b](https://github.com/forgesworn/nostr-veil/commit/cf7882b7f0e3894b6cd2d886c9193a8bc7ca8355))
* drop npm publish from CI release job ([33aaa79](https://github.com/forgesworn/nostr-veil/commit/33aaa7920b4bb0e1f42590cf532e9c52a91cddb7))
* handle bunker mode gracefully in demo hardware path ([9d6b329](https://github.com/forgesworn/nostr-veil/commit/9d6b329c4c5bd9644fab977d86e1e1a4b211a7a2))
* only software-publish ring assertion in demo mode ([50d3810](https://github.com/forgesworn/nostr-veil/commit/50d38100564c1020f3500a03f3c86544df406c73))
* suppress key mismatch warning in heartwood mode ([b27ced6](https://github.com/forgesworn/nostr-veil/commit/b27ced688af7e049d998cb3e25aeaff869cf1ed5))
* use persistent SimplePool for demo relay connections ([adca304](https://github.com/forgesworn/nostr-veil/commit/adca304cebc533d5cd79a92282d50b8a2f0daede))


### Features

* **demo:** surface repo/video/NIP links, add trust trilemma, reframe scope ([5f9a116](https://github.com/forgesworn/nostr-veil/commit/5f9a116fe3fb9eb3932265e9fa9b60e4fe6ebbcb))

## [0.8.4](https://github.com/forgesworn/nostr-veil/compare/v0.8.3...v0.8.4) (2026-04-09)


### Bug Fixes

* abort on persona switch failure instead of signing with wrong key ([68fe14f](https://github.com/forgesworn/nostr-veil/commit/68fe14ffc1cc55b0d296f2b1a8fc946e7e4a7104))

## [0.8.3](https://github.com/forgesworn/nostr-veil/compare/v0.8.2...v0.8.3) (2026-04-09)


### Bug Fixes

* use --key flag in demo bray commands, fix whoami label ([784ab07](https://github.com/forgesworn/nostr-veil/commit/784ab07b5561797b1b9c681023b6ef8772ec5392))

## [0.8.2](https://github.com/forgesworn/nostr-veil/compare/v0.8.1...v0.8.2) (2026-04-09)


### Bug Fixes

* timeout Heartwood switch calls to prevent Bark hangs ([33ad105](https://github.com/forgesworn/nostr-veil/commit/33ad105d614decec7c83c7815d81e9ff9998375a))

## [0.8.1](https://github.com/forgesworn/nostr-veil/compare/v0.8.0...v0.8.1) (2026-04-09)


### Bug Fixes

* use full persona path for Heartwood switch ([075dd4d](https://github.com/forgesworn/nostr-veil/commit/075dd4df6b60fa342767833850cad7a82c57ff47))

# [0.8.0](https://github.com/forgesworn/nostr-veil/compare/v0.7.0...v0.8.0) (2026-04-09)


### Features

* welcome screen, Hetzner deploy, wotathon submission ([d27a6d0](https://github.com/forgesworn/nostr-veil/commit/d27a6d00a679aac37a640a76f1bd6164eb81071e))

# [0.7.0](https://github.com/forgesworn/nostr-veil/compare/v0.6.0...v0.7.0) (2026-04-09)


### Features

* recap screen — identity strip, tags table, nested kind 1 card, collapsible sigs and JSON ([ff0a2f0](https://github.com/forgesworn/nostr-veil/commit/ff0a2f08077dd6b62916cafe545e327d35c7707a))

# [0.6.0](https://github.com/forgesworn/nostr-veil/compare/v0.5.0...v0.6.0) (2026-04-09)


### Features

* derive persona before switch, pre-compute contributor set, recap screen refactor ([4fb8cc3](https://github.com/forgesworn/nostr-veil/commit/4fb8cc3525d06bebbe1f073991f5c65ce137a008))

# [0.5.0](https://github.com/forgesworn/nostr-veil/compare/v0.4.1...v0.5.0) (2026-04-09)


### Features

* replace seed-based 30078 disclosure with Heartwood nested attestation ([bd4a168](https://github.com/forgesworn/nostr-veil/commit/bd4a168ce07406633fd68f9093db32bacaf82081))

## [0.4.1](https://github.com/forgesworn/nostr-veil/compare/v0.4.0...v0.4.1) (2026-04-08)


### Bug Fixes

* warm up Bark connection before signEvent to avoid stale WebSockets ([6a24bc4](https://github.com/forgesworn/nostr-veil/commit/6a24bc402ee4c9ab5d1b59146e5450d20b72e491))

# [0.4.0](https://github.com/forgesworn/nostr-veil/compare/v0.3.0...v0.4.0) (2026-04-08)


### Features

* use nsec-tree derived persona for demo journalist ([9dabe53](https://github.com/forgesworn/nostr-veil/commit/9dabe53da1c6a49abab86af1bd3b8941d30b3d34))

# [0.3.0](https://github.com/forgesworn/nostr-veil/compare/v0.2.2...v0.3.0) (2026-04-08)


### Features

* WoT-a-thon demo overhaul ([9db7a3f](https://github.com/forgesworn/nostr-veil/commit/9db7a3f0f0f174c08296fae4bbf5d9081f53327c))

## [0.2.2](https://github.com/forgesworn/nostr-veil/compare/v0.2.1...v0.2.2) (2026-04-03)


### Bug Fixes

* responsive demo layout, upgrade ring-sig to v3 ([da11eb4](https://github.com/forgesworn/nostr-veil/commit/da11eb4fcc5b284f38fb227970f6ece5900f3364))

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
