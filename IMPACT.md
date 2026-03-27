# nostr-veil -- Impact Statement

## The problem

NIP-85 Trusted Assertions are "trust me" scores. A provider publishes a rank for a pubkey and you either trust the provider or you don't. There is no cryptographic backing -- nothing you can verify independently. And critically, the scores are fully deanonymising: anyone who can see the assertion can see exactly who made it.

This is fine for benign social signals like follower counts. It fails completely for anything that actually requires trust.

Trust systems that expose their contributors will never be used for anything sensitive. Whistleblowers, journalists, abuse reporters, political dissidents -- the people who need Web of Trust most are the ones who cannot afford to be identified.

## The solution

nostr-veil adds one cryptographic layer to NIP-85:

**Ring-signature privacy.** Contributions are signed using LSAG (Linkable Spontaneous Anonymous Group) signatures over secp256k1. A verifier can confirm that *some member* of a defined ring signed the message without learning which one. Key images prevent double-signing -- the same identity cannot contribute twice to the same circle.

The result: a K-of-N threshold assertion where K distinct circle members agreed, verified cryptographically, with no names attached.

## Ecosystem impact

**Backwards compatible.** The published output is a standard kind 30382 NIP-85 event. Any existing NIP-85 client reads it unchanged -- followers count, rank, engagement metrics, all there. Clients that know nothing about nostr-veil still benefit from the aggregated scores.

**Forward compatible.** Veil-aware clients can go further: verify the `veil-ring`, `veil-threshold`, and `veil-sig` tags to confirm the cryptographic proofs. Adoption can happen gradually, without a flag day.

**Part of a broader stack.** nostr-veil is one layer of independently maintained libraries:

- `@forgesworn/ring-sig` -- LSAG ring signatures on secp256k1 (the cryptographic primitive)
- `nsec-tree` -- deterministic sub-identity derivation (compartmentalised personas for trust circles)
- `canary-kit` -- coercion-resistant verification and duress detection
- `signet` -- decentralised identity verification for Nostr
- `dominion` -- epoch-based encrypted content access control

Each library is independently useful beyond nostr-veil. Together they form a complete identity-to-trust pipeline.

## Sustainability

The underlying libraries are not built for this hackathon. They are maintained independently with NLnet and OpenSats funding applications pending:

- `@forgesworn/ring-sig` -- general-purpose ring signature library for any secp256k1 application
- `nsec-tree` -- sub-identity derivation used across the TROTT ecosystem
- `signet` -- identity verification with its own grant pipeline

nostr-veil is a thin integration layer over `@forgesworn/ring-sig`. The maintenance surface is small. If the underlying library is maintained -- and there are strong reasons independent of nostr-veil to maintain it -- then nostr-veil stays current at low cost.

## Why this matters

The harder question is not technical. It is social.

Every trust system that has ever been proposed for sensitive contexts has been abandoned, neutered, or weaponised once it became clear that participation was traceable. Signal graphs get subpoenaed. Vouching relationships get screenshotted. Membership in the wrong trust circle becomes evidence.

The reason abuse reporters do not use Web of Trust is not that the cryptography did not exist. It is that nobody built the layer that makes participation safe.

nostr-veil is that layer. Standard events, standard relays, cryptographic guarantees, anonymous by default.
