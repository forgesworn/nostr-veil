# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in nostr-veil, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainers via GitHub's [private vulnerability reporting](https://github.com/forgesworn/nostr-veil/security/advisories/new)
3. Include steps to reproduce and potential impact

We aim to respond within 48 hours and will coordinate disclosure timelines with you.

## Scope

nostr-veil handles cryptographic key material (secp256k1 private keys) and ring signature operations. Security-relevant areas include:

- **Canonical JSON** — Ring signature messages use deterministic serialisation; any deviation breaks cross-platform verification
- **LSAG signatures** — Key image uniqueness uses timing-safe comparison via `@forgesworn/ring-sig`
- **Event signing** — NIP-01 serialisation for event IDs
- **Election ID binding** — Signatures are bound to a specific circle/scope and subject; opt-in proof v2 also binds the assertion kind and subject hint tag

## Security Guarantees

Within the supported threat model, nostr-veil provides:

- Contributor anonymity within the published ring: a verifier learns that a valid member signed, not which one.
- Duplicate detection within the same circle/scope and subject via LSAG key images.
- Integrity for published metric tags: `verifyProof` recomputes the aggregate from the signed contribution messages.
- Optional v2 semantic binding: applications can require proof v2 so signatures cannot be replayed across assertion kinds or subject hint tags.
- Backwards-compatible publication as NIP-85 assertion events with additive `veil-*` tags.

## Non-Goals and Limits

nostr-veil does not provide full traffic anonymity or a complete reputation policy. In particular:

- The trust circle membership list is public in the `veil-ring` tag.
- The individual anonymous metric values are public in signed proof messages so verifiers can recompute the aggregate.
- Relays, aggregators, and transport observers may learn timing, IP, or collection metadata unless the application protects it separately.
- The library does not decide whether circle members are real humans, independent, or socially trustworthy.
- Federation scopes intentionally make cross-circle overlap observable by key image, while still hiding the signer identity.
- Proof v2 binds NIP-85 semantics; it does not independently prove that an off-chain package, domain, credential, or service identifier is socially legitimate.

Treat nostr-veil as a cryptographic proof layer. Applications still need admission rules, relay/transport privacy, key-handling discipline, and a policy for circle rotation or revocation.

## Dependencies

This project's cryptographic dependencies are:

- `@forgesworn/ring-sig` — SAG/LSAG ring signatures
- `@noble/curves` / `@noble/hashes` — Elliptic curve and hash primitives (audited)
