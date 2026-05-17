# Production deployment checklist

nostr-veil is safe to act on only when the cryptographic proof is combined with
a deployment policy. The policy should be explicit, versioned, and tested.

## Policy checks

Use `createDeploymentPolicy()` for the local deployment controls, then wrap the
policy in `createSignedDeploymentBundle()` before distributing it. Verifiers
should call `verifyProductionDeployment()` with a pinned publisher key. A policy
should include:

- the exact expected subject;
- the canonical subject helper used before signing and verification;
- the accepted circle manifests or explicit circle IDs for this deployment;
- the minimum distinct signer count;
- the freshness window;
- metric bounds and required metrics;
- whether unknown metrics should be rejected;
- whether fetched events must carry a valid Nostr event signature.

```ts
import {
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  canonicalNpmPackageSubject,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  explainVerificationIssue,
  verifyProductionDeployment,
} from 'nostr-veil/profiles'

const trustedPolicyPublishers = [operatorPubkey]
const subject = canonicalNpmPackageSubject('nostr-veil', '0.15.0')
const reviewerPubkeys = [alicePubkey, bobPubkey, carolPubkey].sort()
const packageReviewCircle = createCircleManifest({
  issuedAt: 1778000000,
  expiresAt: 1778000900,
  members: reviewerPubkeys,
  name: 'Package reviewers',
  profileIds: [RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id],
  purpose: 'Release safety review',
})
const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
  circleManifests: [packageReviewCircle],
  expectedSubject: subject,
  metricPolicies: {
    rank: { required: true, min: 0, max: 100, integer: true },
  },
  rejectUnknownMetrics: true,
  requireNostrSignature: true,
})
const bundle = createSignedDeploymentBundle(policy, {
  id: 'package-release-gate',
  issuedAt: 1778000000,
  expiresAt: 1778000900,
  privateKey: operatorPrivateKey,
})

const result = verifyProductionDeployment(assertionFromRelay, bundle, {
  now: Math.floor(Date.now() / 1000),
  trustedPublishers: trustedPolicyPublishers,
})

if (!result.valid) {
  audit(result.issues.map(issue => ({
    ...issue,
    ...explainVerificationIssue(issue),
  })))
  throw new Error(result.errors.join('; '))
}
```

The production verifier is intentionally stricter than
`verifyDeploymentBundle()`: by default it requires a trusted bundle publisher,
an expiring signed bundle, and a bundled policy that requires valid Nostr event
signatures for relay-fetched assertions. The result is a gate, not a business
decision. After it passes, the application still decides what action is
proportionate for that subject and score.

`result.errors` are human-readable. `result.issues` contains stable
machine-readable codes such as `bundle.trusted_publishers_missing`,
`bundle.signer_untrusted`, `bundle.expired`, `event.signature_invalid`,
`circle.unaccepted`, `metric.below_min`, and `policy.nostr_signature_not_required`.
Use those codes for audit logs, alerts, retry decisions, and fail-closed policy.
Use `explainVerificationIssue(issue)` or `remediationForIssue(issue)` when the
operator or application needs the next action as well as the code. For example,
`bundle.trusted_publishers_missing` tells the deployer to pin trusted publisher
keys, while `event.signature_invalid` tells the verifier to reject the fetched
event and optionally retry from another relay.

## Recipe patterns

The runnable examples in
[`examples/production-recipes.ts`](../examples/production-recipes.ts) model
five production-shaped flows:

- package release reputation: show a reviewed-release signal only after the
  signed event, accepted circle, exact package subject, and rank bounds pass;
- relay service preference: prefer a relay only when the relay subject, `k`
  namespace, rank, and count-like metric are all policy-valid;
- NIP-05/domain warning: display a provider trust signal without replacing DNS,
  HTTPS, or NIP-05 verification;
- federated moderation review: use cross-circle evidence to queue human review,
  not to auto-ban;
- relay/community admission: feed the score into a separate admission and rate
  limit system.

Run them with:

```bash
npm run test:production-recipes
```

## Fail closed

A production verifier should reject, or move to manual review, when:

- no accepted circle list or manifest is configured;
- no trusted bundle publisher is configured;
- the deployment bundle is unsigned, expired, tampered, or signed by the wrong
  publisher;
- a manifest is expired, revoked, superseded, or does not allow the profile;
- the assertion is about a different subject;
- the assertion is stale;
- the proof is not v2 for a profile that requires v2;
- the metric is missing, non-numeric, outside range, or unexpected;
- the relay returned an unsigned or tampered signed event;
- a federation has too few circles, mixed scopes, or overlapping contributors
  counted incorrectly.

## Operational controls

These checks do not replace governance. Keep a separate policy for circle
admission, rotation, revocation, evidence handling, appeals, and incident
response. See [circle governance](./circle-governance.md).

## Rotation and revocation

Use manifests to rotate circles without trusting old rings forever:

- publish a new manifest with a new member list and `supersedes` containing the
  old circle ID;
- put compromised or retired circle IDs in `revokedCircleIds`;
- keep `expiresAt` short for high-risk workflows;
- leave `allowSupersededCircleIds` disabled unless the deployment is explicitly
  verifying historical evidence.

Raw `acceptedCircleIds` still work for backwards compatibility, but manifests
are safer because the verifier can reject expired, revoked, wrong-profile, and
superseded circles automatically.

A manifest is deployment configuration. Load it from a trusted release, signed
configuration bundle, or operator-controlled policy source; do not treat an
untrusted manifest fetched from a relay as authority to accept a circle.
