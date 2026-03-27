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
- **Election ID binding** — Signatures are bound to a specific circle+subject combination to prevent transplant attacks

## Dependencies

This project's cryptographic dependencies are:

- `@forgesworn/ring-sig` — SAG/LSAG ring signatures
- `@noble/curves` / `@noble/hashes` — Elliptic curve and hash primitives (audited)
