# nostr-veil — Impact Statement

## The problem

NIP-85 Trusted Assertions are "trust me" scores. A provider publishes a rank for a pubkey and you either trust the provider or you don't. There is no cryptographic backing — nothing you can verify independently. And critically, the scores are fully deanonymising: anyone who can see the assertion can see exactly who made it.

This is fine for benign social signals like follower counts. It fails completely for anything that actually requires trust.

Trust systems that expose their contributors will never be used for anything sensitive. Whistleblowers, journalists, abuse reporters, political dissidents — the people who need Web of Trust most are the ones who cannot afford to be identified.

## The solution

nostr-veil layers three cryptographic primitives onto NIP-85:

**1. Attestation chains.** Each contribution is a kind 31000 verifiable attestation (NIP-VA), anchored to a specific claim. The paper trail exists; it is just anonymous.

**2. Ring-signature privacy.** Contributions are signed using LSAG (Linkable Spontaneous Anonymous Group) signatures over secp256k1. A verifier can confirm that *some member* of a defined ring signed the message without learning which one. Key images prevent double-signing — the same identity cannot contribute twice to the same circle.

**3. Sub-identity compartmentalisation.** Contributors use nsec-tree-derived personas: deterministic sub-keys from a single master secret. A contributor can participate in a trust circle under a persona that is mathematically linked to their real identity but operationally separate. If they choose to disclose later, a zero-knowledge linkage proof connects the persona to the master key.

The result: a K-of-N threshold assertion where K distinct circle members agreed, verified cryptographically, with no names attached.

## Ecosystem impact

**Backwards compatible.** The published output is a standard kind 30382 NIP-85 event. Any existing NIP-85 client reads it unchanged — followers count, rank, engagement metrics, all there. Clients that know nothing about nostr-veil still benefit from the aggregated scores.

**Forward compatible.** Veil-aware clients can go further: verify the `veil-ring`, `veil-threshold`, and `veil-sig` tags to confirm the cryptographic proofs. Adoption can happen gradually, without a flag day.

**Three new npm packages enter the Nostr ecosystem.** nostr-veil itself, plus the underlying libraries it integrates: `@forgesworn/ring-sig` (LSAG ring signatures on secp256k1), `nostr-attestations` (NIP-VA kind 31000), and `nsec-tree` (deterministic sub-identity derivation). Each library is independently useful beyond this project.

**94 unit tests.** The library ships with full test coverage across all three layers.

## Sustainability

The underlying libraries are not built for this hackathon. They are maintained independently with NLnet and OpenSats funding applications pending:

- `@forgesworn/ring-sig` — general-purpose ring signature library for any secp256k1 application
- `nostr-attestations` — NIP-VA implementation used by Signet identity verification
- `nsec-tree` — sub-identity derivation used across the TROTT ecosystem

nostr-veil is a thin integration layer over these primitives. The maintenance surface is small. If the underlying libraries are maintained — and there are strong reasons independent of nostr-veil to maintain them — then nostr-veil stays current at low cost.

## Why this matters

The harder question is not technical. It is social.

Every trust system that has ever been proposed for sensitive contexts has been abandoned, neutered, or weaponised once it became clear that participation was traceable. Signal graphs get subpoenaed. Vouching relationships get screenshotted. Membership in the wrong trust circle becomes evidence.

The reason abuse reporters do not use Web of Trust is not that the cryptography did not exist. It is that nobody built the layer that makes participation safe.

nostr-veil is that layer. Standard events, standard relays, cryptographic guarantees, anonymous by default.
