# nostr-veil

[![CI](https://github.com/forgesworn/nostr-veil/actions/workflows/ci.yml/badge.svg)](https://github.com/forgesworn/nostr-veil/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/nostr-veil)](https://www.npmjs.com/package/nostr-veil)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENCE)

**Trust scores you can verify without seeing who contributed them.**

Privacy-preserving, cryptographically-backed Web of Trust for Nostr. LSAG ring-signature assertions built on NIP-85, with sub-identity compartmentalisation.

---

## The Trust Trilemma

Today's NIP-85 trust scores ask you to pick two:

| Property    | NIP-85 today | nostr-veil |
|-------------|:---:|:---:|
| Verifiable  | ✓   | ✓  |
| Private     | ✗   | ✓  |
| Portable    | ✓   | ✓  |

Anyone who can see the assertions can see exactly who judged you. That works fine for benign social signals. It fails completely the moment the subject matter is sensitive — abuse reporting, whistleblowing, political dissent. The people who need Web of Trust most are the ones who cannot afford to be identified.

nostr-veil solves all three. Assertions are standard NIP-85 events that any existing client can consume. Veil-aware clients can go further and verify the cryptographic proofs that back them.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  NIP-85 foundation  (nostr-veil/nip85)                  │
│  Kind 30382–30385 assertion events + kind 10040         │
│  providers. Standard Nostr. Any client reads it.        │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  Proof layer  (nostr-veil/proof)                        │
│  LSAG ring signatures — each contributor signs          │
│  anonymously. Key images prove distinct signers.        │
│  K-of-N threshold verification without revealing K      │
│  individual identities.                                 │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  Identity layer  (nostr-veil/identity)                  │
│  nsec-tree sub-identities — one master key, many        │
│  compartmentalised personas. Contribute to a trust      │
│  circle as a derived key; prove common ownership        │
│  when you choose to.                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Quick start

```
npm install nostr-veil
```

```ts
import { createTrustCircle, contributeAssertion, aggregateContributions, verifyProof } from 'nostr-veil'

// 1. Define the circle (three anonymous members)
const circle = createTrustCircle([alicePubkey, bobPubkey, carolPubkey])

// 2. Each member contributes independently — their identity is hidden inside the ring
const alice = contributeAssertion(circle, subjectPubkey, { followers: 820, rank: 74 }, alicePrivkey, 0)
const bob   = contributeAssertion(circle, subjectPubkey, { followers: 900, rank: 80 }, bobPrivkey,   1)

// 3. Aggregate into a standard NIP-85 kind 30382 event
const assertion = aggregateContributions(circle, subjectPubkey, [alice, bob])

// 4. Any client verifies — two distinct members agreed, no names attached
const result = verifyProof(assertion)
// { valid: true, circleSize: 3, threshold: 2, distinctSigners: 2, errors: [] }
```

The resulting `assertion` is a plain `EventTemplate` you sign and publish like any other Nostr event.

---

## API reference

### `nostr-veil/nip85` — NIP-85 foundation

| Export | Description |
|--------|-------------|
| `buildUserAssertion(pubkey, metrics)` | Build a kind 30382 user assertion event template |
| `buildEventAssertion(eventId, metrics)` | Build a kind 30383 event assertion |
| `buildAddressableAssertion(address, metrics)` | Build a kind 30384 addressable assertion |
| `buildIdentifierAssertion(identifier, kTag, metrics)` | Build a kind 30385 identifier assertion |
| `buildProviderDeclaration(providers, encryptedContent?)` | Build a kind 10040 provider declaration |
| `parseAssertion(event)` | Parse a raw event into a `ParsedAssertion` |
| `validateAssertion(event)` | Validate a NIP-85 assertion — returns `{ valid, errors }` |
| `assertionFilter(params)` | Build a relay query filter for assertions |
| `providerFilter(pubkey)` | Build a relay query filter for a provider declaration |
| `NIP85_KINDS` | Kind constants: `USER`, `EVENT`, `ADDRESSABLE`, `IDENTIFIER`, `PROVIDER` |

### `nostr-veil/proof` — Ring-signature proof layer

| Export | Description |
|--------|-------------|
| `createTrustCircle(memberPubkeys)` | Create a trust circle from an array of pubkeys |
| `contributeAssertion(circle, subject, metrics, privateKey, memberIndex)` | Produce an anonymous `Contribution` using LSAG |
| `aggregateContributions(circle, subject, contributions, aggregateFn?)` | Aggregate contributions into a signed NIP-85 event (default: median) |
| `verifyProof(event)` | Verify all LSAG signatures and return a `ProofVerification` |
| `canonicalMessage(circleId, subject, metrics)` | Compute the canonical message signed by contributors |

### `nostr-veil/identity` — Sub-identity compartmentalisation

| Export | Description |
|--------|-------------|
| `createUserPersona(rootNsec, name)` | Derive a named persona from a master key |
| `createProviderTree(rootNsec, algorithms)` | Derive per-algorithm provider identities |
| `proveCommonOwnership(root, identityA, identityB, mode?)` | Prove two personas share a master key (blind or full disclosure) |
| `buildDisclosureEvent(proofs)` | Build a kind 30078 disclosure event from linkage proofs |

---

## Demo

The interactive demo walks through a whistleblower scenario: a trust circle vouches anonymously for a source, and an editor verifies the threshold without learning who contributed.

```
npm run demo
```

Opens a Vite dev server. Five screens: The Circle → The Source → The Veil → Verification → The Reveal.

---

## How it works

Each member of a trust circle calls `contributeAssertion` independently. Under the hood this calls `lsagSign` from `@forgesworn/ring-sig`, which produces a Linkable Spontaneous Anonymous Group signature over the canonical message `{ circleId, subject, metrics }`.

The published NIP-85 event carries three extra tags:

- `veil-ring` — the full set of member pubkeys (the ring)
- `veil-threshold` — how many contributions were aggregated out of how many members
- `veil-sig` (one per contribution) — the serialised LSAG signature and key image

A verifier calls `verifyProof`, which:

1. Reconstructs each LSAG signature against the ring
2. Confirms each signature is valid
3. Checks key images are distinct — proving each signer contributed at most once (LSAG linkability property)
4. Confirms the number of valid, distinct signatures meets the threshold

At no point does verification require knowing which member produced which signature. The ring is public. The identities of the actual signers are not.

---

## Built on

- [@forgesworn/ring-sig](https://github.com/forgesworn/ring-sig) — SAG/LSAG ring signatures on secp256k1
- [nostr-attestations](https://github.com/forgesworn/nostr-attestations) — NIP-VA kind 31000 verifiable attestations
- [nsec-tree](https://github.com/TheCryptoDonkey/nsec-tree) — Deterministic Nostr sub-identity derivation

---

## Licence

MIT
