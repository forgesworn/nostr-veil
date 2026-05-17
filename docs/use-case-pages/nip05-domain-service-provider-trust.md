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
const identityProfileKind = '0'
const domainId = 'nip05:alice@example.com'
const circle = createTrustCircle(identityReviewers.map(r => r.pubkey))

const contributions = identityReviewers.map((reviewer) =>
  contributeIdentifierAssertion(
    circle,
    domainId,
    identityProfileKind,
    { rank: reviewer.identityConfidence },
    reviewer.privateKey,
    circle.members.indexOf(reviewer.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateIdentifierContributions(
  circle,
  domainId,
  identityProfileKind,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid identity assertion')
```

## What this proves

- A circle rated the exact identifier string.
- The threshold and aggregate can be verified from the event.
- Proof v2 binds the contribution to the identifier assertion namespace.

## What not to claim

- It does not prove domain control.
- It does not perform NIP-05 resolution.
- It does not prove that a service provider will behave correctly tomorrow.
- It does not make DNS, HTTPS, or provider accounts anonymous.

## Policy choices

- How are domains canonicalised: lowercase, punycode, trailing slash, scheme?
- Does `rank` mean identity confidence, operational reliability, abuse risk, or
  provider trust?
- Should a domain and a specific NIP-05 name be separate subjects?
- What expiry should identity trust carry?
