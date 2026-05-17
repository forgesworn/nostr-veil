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

## What not to claim

- It does not scan code.
- It does not prove a package is safe.
- It does not prove the package identifier is canonical unless your profile
  defines canonicalisation.
- It does not replace provenance, signatures, SBOMs, or reproducible builds.

## Policy choices

- Is the subject a package name, exact version, tarball digest, repository
  commit, maintainer account, or release artifact?
- What review work is required before a member may contribute?
- Does a compromised release get a new assertion or a revocation profile?
- Should package and maintainer scores be separate?
