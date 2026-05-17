# NIP-05, domain, and service-provider trust

Use this when the subject is an identity domain, NIP-05 name, upload provider,
payment endpoint, or other service identifier outside a single Nostr pubkey.

## Fit

- Status: supported today.
- NIP-85 kind: 30385 identifier assertion.
- Subject examples: `nip05:alice@example.com`, `domain:example.com`,
  `lnurlp:alice@example.com`, `nip96:https://upload.example.com`.
- Helpers: `contributeIdentifierAssertion`,
  `aggregateIdentifierContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank`.

## Subject design

- Use kind 30385 because the subject is an identifier outside one Nostr pubkey.
- Decide whether the subject is a whole domain, a specific NIP-05 name, an
  LNURL/payment identifier, an upload endpoint, or a provider account.
- Canonicalise host names, schemes, trailing slashes, punycode, and case rules
  before anyone signs.
- Keep domain trust, NIP-05 name confidence, provider behaviour, and payment
  endpoint risk as separate subjects unless the profile deliberately combines
  them.

## What to publish

- A kind 30385 assertion with the canonical identifier in `d` and the profile
  namespace in `k`.
- A `rank` profile explaining whether the score means identity confidence,
  domain-control confidence, provider reliability, abuse risk, or operational
  trust.
- Proof v2 tags, accepted circle policy, threshold, freshness, and revocation or
  incident rules.
- Evidence references only when safe; DNS, HTTPS, NIP-05, and payment checks
  should happen before review, not inside the nostr-veil proof.

## Implementation recipe

1. Canonicalise the identifier before signing: lowercase host names, agreed
   schemes, punycode handling, and trailing slash rules.
2. Decide whether the subject is a domain, a specific NIP-05 name, a payment
   endpoint, or a service provider.
3. Run the underlying service check outside nostr-veil, then publish the
   threshold-backed assessment.
4. Require proof v2 and verify the expected identifier string, `k` namespace,
   circle, threshold, and freshness.
5. Use expiry because domain ownership and service behaviour can change.

## Worked example

<!-- use-case-example: nip05-domain-service-provider-trust -->

## What to verify

- Strict syntax and a valid proof v2.
- Kind 30385, with `d` equal to the exact canonical identifier and `k` equal to
  the identity/provider profile namespace.
- The circle is trusted for identity or provider review, not merely any
  reputation circle.
- The assertion is fresh enough for domain or provider risk and has not been
  superseded by an incident signal.
- The application has independently resolved the underlying NIP-05, DNS, HTTPS,
  LNURL, or service check when that check matters.

## What this proves

- A circle rated the exact identifier string.
- The threshold and aggregate can be verified from the event.
- Proof v2 binds the contribution to the identifier assertion namespace.

## What not to claim

- Do not claim the proof itself performs NIP-05, DNS, HTTPS, or LNURL
  resolution.
- Do not claim a domain-level score proves every name or endpoint on that domain
  is safe.
- Do not claim provider trust is permanent. Domains and hosted identities can
  change owner or behaviour quickly.

## Failure handling

- Reject assertions for non-canonical names, wrong namespaces, unknown circles,
  stale reviews, or unresolved service checks.
- Split a broad domain assertion into specific NIP-05, endpoint, or provider
  assertions when clients need precision.
- Publish incident, revocation, or downgraded assertions when ownership,
  hosting, TLS, or service behaviour changes.
- Fall back to direct resolution and local policy when no trusted circle has
  reviewed the identifier.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| The proof does not prove domain control. | Perform DNS, HTTPS, NIP-05, LNURL, or service-specific checks before reviewers contribute. |
| The proof does not perform NIP-05 resolution. | Resolve and cache the NIP-05 result in the application; use nostr-veil only for the circle's assessment of that identifier. |
| Providers can change behaviour after review. | Use expiry, periodic re-review, incident assertions, and revocation once the profile supports it. |
| DNS, HTTPS, and provider accounts are not made anonymous. | Use normal operational security for lookups and account management; nostr-veil hides only which circle members contributed. |

## Policy choices

- How are domains canonicalised: lowercase, punycode, trailing slash, scheme?
- Does `rank` mean identity confidence, operational reliability, abuse risk, or
  provider trust?
- Should a domain and a specific NIP-05 name be separate subjects?
- What expiry should identity trust carry?
