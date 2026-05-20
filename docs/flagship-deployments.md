# Flagship deployment profiles

These are the most concrete production paths for nostr-veil. They solve real
coordination problems without asking users to trust an opaque score.

## Package and release reputation

Problem: maintainers, reviewers, and security teams may need to warn about a
release or vouch for a review without exposing every reviewer.

Profile:

- Subject: `npm:<package>@<version>`,
  `package-digest:npm:<package>@<version>:sha256:<hex>`, or another
  application-specific package identifier.
- Kind: 30385 identifier assertion.
- Metric: `rank` as review confidence, maintenance confidence, or release
  safety.
- Verifier controls: accepted security-review circles, expected package
  subject, proof v2, freshness, threshold, companion evidence for provenance,
  SBOM, and vulnerability feeds, and a policy for superseded releases.

What nostr-veil adds: a portable Nostr event saying a threshold of the accepted
review circle signed the aggregate without naming the individual reviewers.

What it does not replace: provenance, signatures, SBOMs, reproducible builds,
static analysis, vulnerability feeds, or human audit records.

## Relay and community admission

Problem: a relay or community may want admission, rate-limit, or moderation
signals without forcing reviewers or inviters to become public targets.

Profile:

- Subject: applicant pubkey for user admission, or `relay:wss://...` for relay
  reputation.
- Kind: 30382 for user admission, 30385 for relay/service reputation.
- Metric: `rank` as confidence to admit, limit, or review.
- Verifier controls: accepted admission circles, threshold, freshness, appeal
  policy, and a separate access-control decision.

What nostr-veil adds: anonymous threshold-backed reviewer input.

What it does not replace: the access-control protocol, relay policy, abuse
evidence, appeals, or operational logging decisions.

## NIP-05, domain, and service-provider trust

Problem: users need trust signals about identity domains, upload services,
payment endpoints, and other providers where the subject is not a single Nostr
pubkey.

Profile:

- Subject: `nip05:<name>@<domain>`, `domain:<domain>`, or a service-specific
  identifier in a custom deployment profile.
- Kind: 30385 identifier assertion.
- Metric: `rank` as provider trust or service confidence.
- Verifier controls: canonical subject helper, accepted provider-review circles,
  proof v2, freshness, threshold, companion evidence for NIP-05/DNS/HTTPS or
  service probes, and incident response for compromised providers.

What nostr-veil adds: a threshold signal from an accepted review circle that
can be verified by any client.

What it does not replace: DNS, HTTPS, NIP-05 verification, service uptime
checks, or contractual provider due diligence.

## Verifier and issuer legitimacy

Problem: credential systems still need to answer who verifies the verifier.
Communities may want proof-of-person, residency, grant eligibility, maintainer,
or witness credentials without making the people reviewing verifiers public
targets.

Profile:

- Subject: `verifier:<credential-class>:<method>:<verifier-id>`, for example
  `verifier:proof-of-person:in-person:<pubkey>`.
- Kind: 30385 identifier assertion.
- Metric: `rank` as verifier confidence, issuer confidence, witness quality, or
  method reliability.
- Verifier controls: accepted verifier-review circles, method-scoped subjects,
  proof v2, freshness, threshold, revocation source, appeal path, and concrete
  checks for each credential artefact.

What nostr-veil adds: an anonymous threshold signal about whether a community
accepts a verifier, issuer, or witness service for a specific credential class
and method.

What it does not replace: holder binding, presentation challenge, expiry,
revocation, issuer metadata, audit records, or the underlying credential
protocol.
