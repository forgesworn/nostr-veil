# Production deployment checklist

nostr-veil is safe to act on only when the cryptographic proof is combined with
a deployment policy. The policy should be explicit, versioned, and tested.

## Policy checks

Use `createDeploymentPolicy()` and `verifyDeploymentPolicy()` for production
flows. A policy should include:

- the exact expected subject;
- the accepted circle IDs for this deployment;
- the minimum distinct signer count;
- the freshness window;
- metric bounds and required metrics;
- whether unknown metrics should be rejected;
- whether fetched events must carry a valid Nostr event signature.

```ts
import {
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  canonicalNpmPackageSubject,
  createDeploymentPolicy,
  verifyDeploymentPolicy,
} from 'nostr-veil/profiles'

const subject = canonicalNpmPackageSubject('nostr-veil', '0.15.0')
const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
  acceptedCircleIds: ['<accepted circle id>'],
  expectedSubject: subject,
  metricPolicies: {
    rank: { required: true, min: 0, max: 100, integer: true },
  },
  rejectUnknownMetrics: true,
  requireNostrSignature: true,
})

const result = verifyDeploymentPolicy(assertionFromRelay, policy, {
  now: Math.floor(Date.now() / 1000),
})

if (!result.valid) throw new Error(result.errors.join('; '))
```

The result is a gate, not a business decision. After it passes, the application
still decides what action is proportionate for that subject and score.

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

- no accepted circle list is configured;
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
