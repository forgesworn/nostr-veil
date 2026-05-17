# Relay and service reputation

Use this when the subject is a relay, upload service, moderation service, bot,
algorithm provider, or other service endpoint rather than a Nostr account.

## Fit

- Status: supported today.
- NIP-85 kind: 30385 identifier assertion.
- Subject examples: `relay:wss://relay.example.com`,
  `service:blossom:example.com`, `bot:pubkey:<pubkey>`.
- Helpers: `contributeIdentifierAssertion`,
  `aggregateIdentifierContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank`, `comment_cnt`, `reaction_cnt`.

The `k` value is an application profile namespace. The example below uses
`10002` because the profile is scoring relay-selection context; choose a
different decimal namespace if your application needs one.

## Implementation recipe

1. Canonicalise the service identifier before signing: scheme, host, port,
   trailing slash, and service class.
2. Define what `rank` measures for this service class: reliability, censorship
   behaviour, latency, privacy, malware risk, support quality, or abuse
   handling.
3. Use a stable `k` namespace per application profile and proof v2 for new
   identifier assertions.
4. Verify the expected identifier, namespace, circle, threshold, and freshness
   before using the score for relay or service selection.
5. Combine nostr-veil with monitoring and incident reports when clients need
   current operational data.

## Worked example

```ts
import {
  aggregateIdentifierContributions,
  contributeIdentifierAssertion,
  createTrustCircle,
  validateAssertionStrict,
  verifyProof,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const relayProfileKind = '10002'
const relayId = 'relay:wss://relay.example.com'
const circle = createTrustCircle(serviceReviewers.map(r => r.pubkey))

const contributions = serviceReviewers.map((reviewer) =>
  contributeIdentifierAssertion(
    circle,
    relayId,
    relayProfileKind,
    {
      rank: reviewer.reliabilityRank,
      reaction_cnt: reviewer.observationCount,
    },
    reviewer.privateKey,
    circle.members.indexOf(reviewer.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateIdentifierContributions(
  circle,
  relayId,
  relayProfileKind,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid relay assertion')
```

## What this proves

- Distinct members of the service-review circle rated the same identifier.
- The aggregate matches the signed service metrics.
- Proof v2 binds the assertion to kind 30385 and the chosen `k` namespace.

## Boundary and companion controls

| Boundary | Add this to cover it |
| --- | --- |
| The proof does not continuously monitor relay uptime. | Pair the score with uptime probes, latency checks, incident reports, and expiry. |
| The proof does not prove a service is honest or non-malicious. | Add audits, canary tests, operational transparency, and client-side safety checks. |
| One circle's service registry is not universal. | Publish the circle profile and let clients choose which circles or federations they trust. |
| Identifier ambiguity can split or merge scores incorrectly. | Document canonicalisation and namespace rules before collecting contributions. |

## Policy choices

- How is the service identifier canonicalised?
- Does the score cover uptime, censorship behaviour, performance, malware risk,
  privacy, or support quality?
- How quickly should stale service reviews expire?
- Should different service classes use separate `k` namespaces?
