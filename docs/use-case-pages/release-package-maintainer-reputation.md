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
- Canonical helpers: `canonicalNpmPackageSubject`,
  `canonicalGitRepositorySubject`, `canonicalGithubRepositorySubject`, and
  `canonicalMaintainerSubject`.
- Helpers: `contributeIdentifierAssertion`,
  `aggregateIdentifierContributions`.
- Proof version: v2 recommended.
- Useful metrics: `rank` as safety, review confidence, or maintenance
  confidence.

## Subject design

- Use kind 30385 because package names, release artefacts, commits, and
  maintainer identities are external identifiers.
- Decide exactly what is being scored: package name, exact version, tarball
  digest, repository commit, signed release artefact, maintainer account, or
  project namespace.
- Prefer digest-bound subjects for high-risk decisions. A package name or
  version can be republished, mirrored, or confused across registries.
- Keep maintainer trust, release readiness, vulnerability review, and malware
  suspicion as separate profiles unless a policy explicitly combines them.

## What to publish

- A kind 30385 assertion with the canonical software identifier in `d` and the
  software-review namespace in `k`.
- A `rank` profile explaining whether the value means release safety, audit
  confidence, maintenance confidence, compromise suspicion, or deploy readiness.
- Proof v2 tags from the security-review circle, plus threshold, aggregate
  method, expiry, and revocation policy.
- Links or companion records for provenance, signatures, SBOMs, reproducible
  builds, CI, vulnerability scans, and human audit notes.

## Implementation recipe

1. Decide the exact subject: package name, package version, tarball digest,
   repository commit, release artefact, or maintainer identity.
2. Canonicalise that subject before signing with the package, git repository,
   GitHub repository, or maintainer helper so every reviewer scores the same
   string.
3. Define what `rank` means: safety, audit confidence, maintenance confidence,
   compromise suspicion, or release readiness.
4. Require proof v2, then verify the expected identifier, namespace, circle,
   threshold, and freshness.
5. Combine the score with provenance, signatures, SBOMs, reproducible builds,
   CI, and human audit results.

## Worked example

<!-- use-case-example: release-package-maintainer-reputation -->

## What to verify

- Strict syntax and a valid proof v2.
- Kind 30385, with `d` equal to the canonical package, release, digest, commit,
  or maintainer subject and `k` equal to the software-review namespace.
- The `veil-ring` matches an accepted reviewer circle with the right expertise
  and independence for the package class.
- The threshold, freshness, and `rank` meaning match the consuming policy.
- The external artefact checks still pass: registry metadata, digest,
  signature, provenance, SBOM, CI, and any required audit evidence.

## What this proves

- Distinct members of the security-review circle scored the exact package
  identifier.
- The aggregate score can be independently recomputed.
- Proof v2 prevents the package contribution being replayed as a user or event
  reputation proof.

## What not to claim

- Do not claim nostr-veil scanned the code or proved the package is safe. It
  proves reviewer consensus over a subject.
- Do not claim a maintainer score applies to every release, or a release score
  applies to future releases.
- Do not claim the proof replaces provenance, signatures, vulnerability
  scanning, or reproducible-build checks.

## Failure handling

- Reject assertions for ambiguous package identifiers, wrong namespaces,
  untrusted reviewer circles, stale reviews, or mismatched artefact digests.
- Publish a downgrade, incident, or revocation assertion when a release is
  yanked, compromised, rebuilt, or found vulnerable.
- Require a new assertion for materially different artefacts, even if the
  package name and version look similar.
- Escalate disagreement between independent reviewer circles to the package
  manager or security UI instead of hiding the conflict.

## Operational requirements

| Risk to handle | Required control |
| --- | --- |
| nostr-veil does not scan code. | Run static analysis, dependency review, tests, malware checks, and human audit before reviewers contribute. |
| A threshold score does not prove a package is safe. | Treat it as reviewer consensus and combine it with signatures, provenance, SBOMs, reproducible builds, and incident response. |
| The package identifier is not canonical by default. | Define canonical identifiers for registry, version, digest, repo, commit, and maintainer subjects. Prefer digest-bound subjects for high-risk releases. |
| Maintainer and release risk are different. | Publish separate assertions for package versions, release artefacts, repositories, and maintainer identities. |

## Policy choices

- Is the subject a package name, exact version, tarball digest, repository
  commit, maintainer account, or release artefact?
- What review work is required before a member may contribute?
- Does a compromised release get a new assertion or a revocation profile?
- Should package and maintainer scores be separate?
