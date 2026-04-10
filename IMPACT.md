# nostr-veil -- Impact Statement

## The problem

Nostr has a standard for publishing trust scores about people -- [NIP-85](https://github.com/nostr-protocol/nips/blob/master/85.md). A provider publishes a reputation score for a user and you either trust the provider or you don't. But critically, the scores are fully transparent: anyone who can see the score can see exactly who gave it.

This is fine for benign social signals like follower counts. It fails completely for anything that actually requires trust.

Reputation systems that expose their contributors will never be used for anything sensitive. Whistleblowers, journalists, abuse reporters, political dissidents -- the people who need reputation systems most are the ones who cannot afford to be identified.

## The solution

nostr-veil adds one cryptographic layer to NIP-85: **anonymous group signatures**.

A defined group of people (a "trust circle") collectively score a subject. Each member's contribution is wrapped in a *ring signature* -- a cryptographic technique where a verifier can confirm that *some member* of the group signed the message, without learning which one. A built-in duplicate-detection mechanism prevents the same person from contributing twice.

The result: a K-of-N threshold score where K distinct circle members agreed, verified cryptographically, with no names attached.

## Ecosystem impact

**Backwards compatible.** The published output is a standard NIP-85 event. Any existing Nostr app that understands reputation scores reads it unchanged -- follower counts, rank, engagement metrics, all there. Apps that know nothing about nostr-veil still benefit from the aggregated scores.

**Forward compatible.** Apps that do understand nostr-veil can go further: verify the extra tags that carry the cryptographic proofs. Adoption can happen gradually, without a flag day.

**Part of a broader stack.** nostr-veil is one layer of independently maintained libraries:

- `@forgesworn/ring-sig` -- the ring signature engine (the core cryptography)
- `nsec-tree` -- generates separate anonymous identities from a single master key
- `canary-kit` -- detects when someone is being coerced (duress signals)
- `signet` -- decentralised identity verification for Nostr
- `dominion` -- time-limited encrypted content access control

Each library is independently useful beyond nostr-veil. Together they form a complete identity-to-trust pipeline.

## Sustainability

The underlying libraries are not built for this hackathon. They are maintained independently with NLnet and OpenSats funding applications pending:

- `@forgesworn/ring-sig` -- general-purpose ring signature library (useful beyond nostr-veil)
- `nsec-tree` -- sub-identity derivation used across the TROTT ecosystem
- `signet` -- identity verification with its own grant pipeline

nostr-veil is a thin integration layer over `@forgesworn/ring-sig`. The maintenance surface is small. If the underlying library is maintained -- and there are strong reasons independent of nostr-veil to maintain it -- then nostr-veil stays current at low cost.

## Why this matters

The harder question is not technical. It is social.

Every trust system that has ever been proposed for sensitive contexts has been abandoned, neutered, or weaponised once it became clear that participation was traceable. Signal graphs get subpoenaed. Vouching relationships get screenshotted. Membership in the wrong trust circle becomes evidence.

The reason abuse reporters do not use Web of Trust is not that the cryptography did not exist. It is that nobody built the layer that makes participation safe.

nostr-veil is that layer. Standard events, standard relays, cryptographic guarantees, anonymous by default.
