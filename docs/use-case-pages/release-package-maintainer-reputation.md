# Release, package, and maintainer reputation

Use this when security reviewers or maintainers want to publish a threshold
signal about software without exposing every reviewer to the project, sponsor,
or attacker.

## Fit

- Status: supported today.
- NIP-85 kind: 30385 identifier assertion.
- Subject examples: `npm:nostr-veil@0.14.0`,
  `git:https://github.com/forgesworn/nostr-veil@36f74b0`,
  `maintainer:github:forgesworn`.
- Helpers: `contributeIdentifierAssertion`,
  `aggregateIdentifierContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank` as safety, review confidence, or maintenance
  confidence.

## Implementation recipe

1. Decide the exact subject: package name, package version, tarball digest,
   repository commit, release artifact, or maintainer identity.
2. Canonicalise that subject before signing so every reviewer scores the same
   string.
3. Define what `rank` means: safety, audit confidence, maintenance confidence,
   compromise suspicion, or release readiness.
4. Require proof v2, then verify the expected identifier, namespace, circle,
   threshold, and freshness.
5. Combine the score with provenance, signatures, SBOMs, reproducible builds,
   CI, and human audit results.

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
const softwareProfileKind = '0'
const packageId = 'npm:nostr-veil@0.14.0'
const circle = createTrustCircle(securityReviewers.map(r => r.pubkey))

const contributions = securityReviewers.map((reviewer) =>
  contributeIdentifierAssertion(
    circle,
    packageId,
    softwareProfileKind,
    { rank: reviewer.releaseSafetyRank },
    reviewer.privateKey,
    circle.members.indexOf(reviewer.pubkey),
    { proofVersion },
  ),
)

const assertion = aggregateIdentifierContributions(
  circle,
  packageId,
  softwareProfileKind,
  contributions,
  { proofVersion },
)

const syntax = validateAssertionStrict(assertion)
const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
if (!syntax.valid || !proof.valid) throw new Error('invalid package assertion')
```

## What this proves

- Distinct members of the security-review circle scored the exact package
  identifier.
- The aggregate score can be independently recomputed.
- Proof v2 prevents the package contribution being replayed as a user or event
  reputation proof.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not scan code. | Run static analysis, dependency review, tests, malware checks, and human audit before reviewers contribute. |
| A threshold score does not prove a package is safe. | Treat it as reviewer consensus and combine it with signatures, provenance, SBOMs, reproducible builds, and incident response. |
| The package identifier is not canonical by default. | Define canonical identifiers for registry, version, digest, repo, commit, and maintainer subjects. Prefer digest-bound subjects for high-risk releases. |
| Maintainer and release risk are different. | Publish separate assertions for package versions, release artifacts, repositories, and maintainer identities. |

## Policy choices

- Is the subject a package name, exact version, tarball digest, repository
  commit, maintainer account, or release artifact?
- What review work is required before a member may contribute?
- Does a compromised release get a new assertion or a revocation profile?
- Should package and maintainer scores be separate?
