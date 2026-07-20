# nostr-veil — Submission

## The problem in plain English

Every reputation system on the internet has the same flaw: you can see who endorsed whom.

That sounds harmless for restaurant reviews or follower counts. It becomes dangerous the moment the subject is sensitive. A whistleblower's colleagues know they're being watched. An abuse victim's friends are afraid to vouch for them publicly. A political dissident cannot risk being listed as a trusted contact.

The people who need reputation systems most are the people who cannot afford to use them.

---

## What is a Web of Trust?

A Web of Trust (WoT) is how decentralised networks decide who to trust when there is no central authority to ask.

Instead of a company like Twitter deciding your credibility score, trust flows from people you already trust. If Alice trusts Bob, and Bob vouches for Carol, Alice can extend a degree of trust to Carol. Each node in the graph is a person; each edge is a trust assertion.

**Nostr** is a decentralised social protocol used by hundreds of thousands of people. It has a standard for publishing these trust scores called **NIP-85 Trusted Assertions**: kind `30382` events where a trusted provider publishes scores (rank, follower count, engagement) for any pubkey.

The problem with NIP-85 today: every assertion is signed with the publisher's key. The trust graph is fully public. Anyone can see who is vouching for whom.

---

## What nostr-veil does

nostr-veil adds one cryptographic layer to NIP-85: **ring-signature privacy**.

A group of trusted people form a **trust circle**. Each member scores a subject independently. Their individual scores are wrapped in a **Linkable Spontaneous Anonymous Group (LSAG) ring signature** — a cryptographic construction that proves *someone in the circle* signed, without revealing *which* member.

The aggregated result is published as a completely standard NIP-85 `kind 30382` event. Any existing Nostr client reads it unchanged. Veil-aware clients can additionally verify the cryptographic proofs embedded in the `veil-ring`, `veil-threshold`, and `veil-sig` tags.

```
Before:  Alice signs → "I endorse Bob, rank 85"   (Alice is identified)

After:   Circle signs → "3 of 8 circle members endorse Bob, rank 80"
         Verifiable: yes    Signer identity: unknown
```

**Key properties:**

| Property | NIP-85 today | nostr-veil |
|---|:---:|:---:|
| Verifiable by anyone | ✓ | ✓ |
| Backwards compatible with existing clients | ✓ | ✓ |
| Contributor identity hidden | ✗ | ✓ |
| Double-signing prevented | ✗ | ✓ |

The LSAG linkability property means the same person cannot contribute twice to the same circle: each signature produces a unique **key image** that is checked on verification. You can prove someone was in the ring; you cannot prove which member they were.

---

## The interactive demo

**Live demo:** [https://nostr-veil.pages.dev](https://nostr-veil.pages.dev)

The demo tells a concrete story: a group of journalists anonymously scoring a whistleblower source's credibility before publishing. The scenario is chosen deliberately — it is the use case where deanonymisation causes the most harm.

### What you will see

**Step 1 — The Circle.** Eight journalists form a trust circle. The user takes one journalist's role. The circle ID is derived deterministically from the sorted member pubkeys: change the membership and the ID changes.

**Step 2 — The Source.** An anonymous source has come forward claiming to have leaked documents from a major corporation. The journalist assigns a credibility score (0–100).

**Step 3 — The Veil.** Five of the eight journalists contribute anonymous LSAG-signed assessments. A `kind 30382` NIP-85 event is constructed live, showing the `veil-ring`, `veil-threshold`, and `veil-sig` tags being assembled in real time. The median score is aggregated. No individual score is visible.

**Step 4 — Verification.** The ring signature proof is verified step by step: extract the ring, parse each LSAG signature, verify against the ring, check key images for double-signers, confirm threshold. Result: `VALID — 5 distinct signers in a circle of 8`.

**Step 5 — The Reveal (optional).** One journalist wants to claim credit for being in the circle — perhaps for a journalism award, or legal protection. Using **nsec-tree** (a companion library for deterministic sub-identity derivation), the journalist proves they own both their anonymous circle persona and their public identity, without revealing which score was theirs. The other seven journalists remain anonymous.

**Step 6 — The Network.** A live trust graph shows all assertions, ring endorsements, and canary heartbeats. Two interactive demonstrations:
- **Ring Endorse** — shows an anonymous NIP-85 assertion flowing through the ring as an animated LSAG arc
- **Duress** — simulates a coerced member. Their heartbeat (canary-kit) stops. The network isolates the node, severs edges, and warns adjacent members. Ring signatures alone are not sufficient; coercion resistance requires liveness too.

---

## How the cryptography works (non-technical)

Think of a ring signature like a signed note that says "one of these ten people wrote this" — but the note itself gives no clue which one. The mathematics ensure you cannot work backwards.

LSAG adds one property on top: **linkability**. Every signature produces a unique "key image" that is deterministic per private key. If the same person signs twice, their two key images will match. A verifier can detect double-voting without knowing who voted.

The signed message includes the circle ID and the subject pubkey, which means signatures from one circle cannot be replayed in another.

---

## The broader ecosystem

nostr-veil is a thin integration layer. The real work is in the primitives beneath it:

| Library | What it does | Independently useful |
|---|---|:---:|
| `@forgesworn/ring-sig` | SAG / LSAG ring signatures on secp256k1 | ✓ |
| `nsec-tree` | Deterministic sub-identity derivation from a master key | ✓ |
| `canary-kit` | Coercion-resistant liveness and duress detection | ✓ |
| `signet` | Decentralised identity verification for Nostr | ✓ |
| `dominion` | Epoch-based encrypted access control | ✓ |

Each library is maintained independently and is generally useful outside of nostr-veil. The maintenance surface for nostr-veil itself is small: if the underlying `@forgesworn/ring-sig` primitive is maintained, nostr-veil stays current at low cost.

NLnet and OpenSats funding applications are pending for `@forgesworn/ring-sig`, `nsec-tree`, and `signet`.

---

## Who needs this

- **Journalists** verifying source credibility without exposing their network
- **Abuse reporting platforms** where reporters fear retaliation
- **Whistleblower networks** where association is itself dangerous
- **Political dissidents** in environments where trust relationships are surveilled
- **Anonymous peer review** where pre-publication bias is a concern

The pattern generalises: any context where the score — or the vote — is useful but the contributor's identity creates risk. The same circles can tally an anonymous board, committee, or cooperative decision, not just a trust score (a building block today; a full voting workflow is on the roadmap).

---

## Technical summary

- **Language:** TypeScript, ESM-only
- **Cryptographic primitive:** LSAG on secp256k1 via `@forgesworn/ring-sig`
- **Nostr protocol:** NIP-85 (`kind 30382–30385`, `kind 10040`)
- **Output format:** standard Nostr event, fully backwards compatible
- **Tests:** 292 tests across 28 files
- **Package:** [`nostr-veil`](https://www.npmjs.com/package/nostr-veil) on npm
- **Source:** [github.com/forgesworn/nostr-veil](https://github.com/forgesworn/nostr-veil)
- **Demo:** [nostr-veil.pages.dev](https://nostr-veil.pages.dev)
