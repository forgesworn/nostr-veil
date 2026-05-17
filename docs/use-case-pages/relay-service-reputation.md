# Relay and service reputation

Use this when the subject is a relay, upload service, moderation service, bot,
algorithm provider, or other service endpoint rather than a Nostr account.

## Fit

- Status: supported today.
- NIP-85 kind: 30385 identifier assertion.
- Subject examples: `relay:wss://relay.example.com`,
  `service:blossom:example.com`, `service:moderation:https://mod.example.com/api`.
- Canonical helpers: `canonicalRelaySubject` and
  `canonicalServiceSubject`.
- Helpers: `contributeIdentifierAssertion`,
  `aggregateIdentifierContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank`, `comment_cnt`, `reaction_cnt`.

The `k` value is an application profile namespace. The example below uses
`10002` because the profile is scoring relay-selection context; choose a
different decimal namespace if your application needs one.

## Subject design

- Use kind 30385 when the subject is an endpoint, service, bot, API, or relay
  rather than a user pubkey.
- Canonicalise the identifier before review: scheme, host, port, path, trailing
  slash, service class, and any punycode or case rules.
- Use separate subjects for different service classes. A relay uptime score
  should not automatically apply to an upload service on the same domain.
- Pick a stable `k` namespace for the application profile and document it so
  verifiers know what kind of identifier is being scored.

## What to publish

- A kind 30385 assertion created with `aggregateIdentifierContributions`.
- The exact service identifier in `d`, the profile namespace in `k`, and metric
  tags for the service behaviour being scored.
- Monitoring or audit references outside the assertion when clients need
  evidence of uptime, censorship behaviour, malware incidents, or support
  quality.
- An expiry policy, because service behaviour can change faster than social
  reputation.

## Implementation recipe

1. Canonicalise the service identifier before signing with
   `canonicalRelaySubject` or `canonicalServiceSubject`: scheme, host, port,
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

<!-- use-case-example: relay-service-reputation -->

## What to verify

- Strict syntax and a valid proof v2.
- Kind 30385, with `d` equal to the canonical service id and `k` equal to the
  profile namespace the client understands.
- The service-review ring is trusted for this service class and has enough
  distinct signers.
- The score is recent enough for operational use, or paired with live probes for
  uptime-sensitive decisions.
- The metric meaning matches the decision: reliability, censorship behaviour,
  privacy, malware risk, or another declared axis.

## What this proves

- Distinct members of the service-review circle rated the same identifier.
- The aggregate matches the signed service metrics.
- Proof v2 binds the assertion to kind 30385 and the chosen `k` namespace.

## What not to claim

- Do not claim the proof is live uptime monitoring. It is a threshold review
  signal.
- Do not claim a high score proves the service is honest or safe. Use probes,
  audits, canaries, and client-side safety checks.
- Do not claim one circle's service registry is universal. Clients decide which
  circles they trust.

## Failure handling

- Reject ambiguous or non-canonical identifiers and require reviewers to sign
  the corrected subject.
- Expire stale service scores and prefer live telemetry when the action depends
  on current uptime.
- Publish incident or downgrade assertions when a service changes ownership,
  censors unexpectedly, leaks data, or ships malicious behaviour.
- Show separate scores for separate service classes instead of merging them by
  domain.

## Operational requirements

| Risk to handle | Required control |
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
