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

## What not to claim

- It does not continuously monitor relay uptime.
- It does not prove a service is honest or non-malicious.
- It does not make one circle's service registry universal.

## Policy choices

- How is the service identifier canonicalised?
- Does the score cover uptime, censorship behaviour, performance, malware risk,
  privacy, or support quality?
- How quickly should stale service reviews expire?
- Should different service classes use separate `k` namespaces?
