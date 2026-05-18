# Relay or community admission

Use this when a relay, forum, chat, marketplace, or private community wants a
threshold-backed admission signal without exposing which reviewers vouched for
the applicant. nostr-veil supports the admission-gate building block today: a
normal NIP-85 kind 30382 vouch for the applicant pubkey, plus an additive
challenge/presentation handshake that proves the live applicant controls that
pubkey.

A complete anonymous-access system still needs session continuity, transport
privacy, revocation, rate limiting, and abuse handling outside the NIP-85
assertion. Treat nostr-veil as the verifiable admission evidence, not as the
whole relay policy engine.

## Fit

- Status: supported admission-gate building block today; full anonymous-access
  profile still future.
- Current NIP-85 shape: kind 30382 user assertion for the candidate pubkey.
- Subject: candidate account pubkey in `d`, mirrored in `p`.
- Helper path: `createAdmissionChallenge()`,
  `createAdmissionPresentation()`, and `verifyAdmissionRequest()`.
- Proof version: v2 recommended because it binds the kind and subject hint to
  the proof context.
- Useful metric today: `rank` as admission confidence, sponsor confidence, or
  policy completeness.

## Subject design

- The NIP-85 subject is the applicant pubkey. Use kind 30382, with `d` and `p`
  equal to that pubkey.
- The admission challenge is separate from the NIP-85 event. It binds a single
  admission attempt to the applicant pubkey, the relay or community audience,
  an expiry, and a nonce.
- The applicant presentation is also separate from the NIP-85 event. It is a
  Schnorr signature by the applicant pubkey over the challenge context.
- The deployment bundle is signed operator policy. It says which admission
  circle, threshold, subject, freshness, and metric bounds the verifier accepts.
- If the bundle is distributed over Nostr, carry it in a separate application
  event such as NIP-78 kind 30078. That transport event is not a NIP-85
  assertion and must not be counted as the vouch.

## What to publish

- Publish the vouch as a signed NIP-85 kind 30382 event produced by
  `aggregateContributions()`.
- Keep the vouch tags canonical: `d`, `p`, metric tags such as `rank`, and
  `veil-*` proof tags. Do not add `admission-*` tags to the NIP-85 event.
- Publish or distribute the signed deployment bundle from a trusted operator
  key. This can be HTTPS, a release artefact, operator config, or a NIP-78 kind
  30078 application data event.
- Do not publish the challenge as long-lived state. It is an admission attempt,
  so keep it short-lived and store only the replay cache or audit record needed
  by the relay.

## Operator recipe

1. Build an admission circle manifest with the reviewer pubkeys and the
   `relay-community-admission` profile id.
2. Build a deployment policy for the applicant pubkey, requiring `rank`, proof
   v2, an accepted circle, fresh events, and valid Nostr signatures.
3. Sign that policy with `createSignedDeploymentBundle()` and pin the bundle
   signer in relay config.
4. When an applicant connects, create an admission challenge for
   `relay:wss://your-relay.example`.
5. Ask the applicant to return `createAdmissionPresentation(challenge,
   applicantPrivateKey)`, or the equivalent wallet/client signature.
6. Fetch the applicant's signed kind 30382 vouch and the current signed bundle.
7. Call `verifyAdmissionRequest(vouch, bundle, challenge, presentation, {
   trustedPublishers, expectedAudience, usedChallengeIds, revokedApplicantPubkeys
   })`.
8. Act on the decision band: `admit`, `rate-limit`, `manual-review`, `deny`, or
   `revoke`.

```ts
const challenge = createAdmissionChallenge({
  applicantPubkey,
  audience: 'relay:wss://relay.example.com',
  maxAgeSeconds: 120,
})

const result = verifyAdmissionRequest(vouchFromRelay, signedBundle, challenge, presentation, {
  admitRank: 90,
  expectedAudience: 'relay:wss://relay.example.com',
  now: Math.floor(Date.now() / 1000),
  rateLimitRank: 75,
  revokedApplicantPubkeys,
  trustedPublishers: [operatorBundlePubkey],
  usedChallengeIds,
})

if (result.decision === 'admit') admit(applicantPubkey)
if (result.decision === 'rate-limit') admitWithLimits(applicantPubkey)
if (result.decision === 'manual-review') queueReview(applicantPubkey, result.errors)
if (result.decision === 'deny') rejectAdmission(applicantPubkey, result.errors)
if (result.decision === 'revoke') revokeSession(applicantPubkey)
```

## Worked example for the vouch

<!-- use-case-example: relay-community-admission -->

## Live relay proof

The public live smoke test publishes two signed events to `wss://relay.trotters.cc`:

- a NIP-85 kind 30382 admission vouch whose tags stay byte-for-byte aligned with
  the canonical example;
- a NIP-78 kind 30078 application data event that carries the signed deployment
  bundle for the verifier.

The test fetches both events back by id, verifies their Nostr signatures, parses
the signed bundle, verifies the bundle signature and trusted publisher, then
runs `verifyAdmissionRequest()` against the fetched vouch. Run it locally with:

```bash
npm run test:admission-gate:relay -- --dry-run
npm run test:admission-gate:relay -- --write docs/admission-gate-relay-check.json
```

## What to verify

- The vouch is NIP-85 kind 30382, with `d` and `p` equal to the applicant
  pubkey.
- The vouch has strict syntax and a valid proof v2.
- The vouch Nostr event signature is valid after relay fetch.
- The admission circle is accepted by the signed deployment bundle and has
  enough distinct signers.
- The `rank` metric is present, numeric, bounded, and has a documented decision
  meaning.
- The deployment bundle is signed, unexpired, and signed by a trusted operator
  key.
- The challenge is fresh, for the expected relay or community audience, and not
  in the replay cache.
- The presentation signature verifies against the applicant pubkey.
- The presentation applicant matches the vouch subject.
- The applicant is not revoked, banned, or already rate-limited by local policy.

## What this proves today

- Enough distinct admission-circle members vouched for the applicant pubkey.
- The public vouch does not reveal which circle members contributed.
- The live applicant controlled the vouched pubkey for this challenge.
- The relay can make an admission decision using signed policy instead of
  handwritten glue.

## What this does not solve by itself

| Boundary | What to do |
| --- | --- |
| The applicant pubkey is public in the kind 30382 vouch. | Use this as pubkey-bound admission today. For anonymous admission, add a credential/session profile that does not reuse the public applicant pubkey as the access token. |
| IP address, timing, and relay metadata are outside the proof. | Add transport privacy, batching, short logs, and metadata-minimising client flows. |
| A valid vouch is not a permanent right to enter. | Keep bans, revocation, expiry, rate limits, and appeal policy in the relay/community system. |
| A signed bundle says what policy was configured, not that the policy is socially good. | Govern circle membership, reviewer independence, conflicts, evidence retention, and incident response. |
| Replay protection is local state. | Store used challenge ids until expiry and reject duplicates before applying the admission decision. |

## What not to claim

- Do not claim nostr-veil currently implements complete anonymous relay access.
- Do not claim the vouch hides the applicant pubkey; today's building block is a
  public assertion about that pubkey.
- Do not claim a valid vouch overrides relay policy, bans, rate limits,
  moderation action, or abuse response.
- Do not treat the NIP-78 kind 30078 bundle transport event as a NIP-85
  assertion. It is just a signed carrier for operator policy in the live test.

## Failure handling

- Reject vouches for the wrong pubkey, wrong kind, stale proof, unknown circle,
  insufficient threshold, or invalid Nostr signature.
- Reject bundles that are missing, expired, unsigned, tampered, or signed by an
  untrusted publisher.
- Reject presentations for the wrong audience, expired challenges, replayed
  challenge ids, invalid applicant signatures, or a pubkey mismatch.
- Move to manual review when the proof is valid but the score falls into the
  manual band.
- Rate-limit instead of fully admitting when the score is enough to reduce
  friction but not enough for normal privileges.
- Revoke or deny when the applicant is in local revocation, ban, or abuse state,
  even if the old vouch still verifies.

## Operational controls

| Risk to handle | Required control |
| --- | --- |
| Challenge replay | Short challenge TTL, replay cache keyed by challenge id, and one decision per challenge. |
| Clock skew | Small tolerance in the relay, short bundle/assertion expiry, and monitoring for future-dated events. |
| Stale reviewers | Circle manifests with expiry, supersession, and revoked circle ids. |
| Untrusted policy updates | Pin trusted bundle publisher pubkeys and rotate with an explicit operator process. |
| Applicant compromise | Revocation list, re-admission rules, session invalidation, and appeal path. |
| Reviewer abuse | Circle governance, independence rules, evidence retention, audit logs, and conflict handling. |
