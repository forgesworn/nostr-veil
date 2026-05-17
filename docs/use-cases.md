# nostr-veil use cases

nostr-veil is a proof layer for anonymous, threshold-backed NIP-85 assertions.
It can say:

- these metrics were contributed by distinct members of this public trust circle;
- the published aggregate matches the signed contributions;
- optional proof v2 binds the proof to the assertion kind and subject hint tag;
- scoped federations can count overlapping contributors once across circles.

It does not decide whether a circle is socially legitimate, whether a claim is
true, whether an off-chain package or domain is safe, or whether a verifier
should act on the score. Those are application policy decisions.

Each worked page is written as an implementation profile: choose the subject,
pick the helper, define the metric meaning, require the right proof version,
then add the operational controls that sit outside the cryptographic proof.

For production deployments, use the machine-readable profiles and safe verifier
from `nostr-veil/profiles` through an explicit deployment policy:

```ts
import {
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  canonicalNpmPackageSubject,
  createDeploymentPolicy,
  verifyDeploymentPolicy,
} from 'nostr-veil/profiles'

const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
  acceptedCircleIds: ['<accepted circle id>'],
  expectedSubject: subject,
  metricPolicies: {
    rank: { required: true, min: 0, max: 100, integer: true },
  },
  rejectUnknownMetrics: true,
})
const result = verifyDeploymentPolicy(assertion, policy, {
  now: Math.floor(Date.now() / 1000),
})

if (!result.valid) throw new Error(result.errors.join('; '))
```

See [circle governance](./circle-governance.md) for the operational controls
that make a circle safe to trust, and
[production deployment](./production-deployment.md) and
[flagship deployments](./flagship-deployments.md) for concrete production
profiles and verifier recipes.

## Implementation pattern

For any supported use case:

1. Define the trust circle and how members are admitted.
2. Pick the NIP-85 assertion kind that matches the subject.
3. Collect anonymous contributions from circle members.
4. Aggregate the contributions into a NIP-85 event.
5. Sign and publish the aggregate like any other Nostr event.
6. Verify with `verifyProof`, and require proof v2 for workflows that rely on
   kind/subject binding.

Use proof v2 for new non-user workflows:

```ts
const assertion = aggregateIdentifierContributions(
  circle,
  'npm:nostr-veil@0.14.0',
  '0',
  contributions,
  { proofVersion: 'v2' },
)

const proof = verifyProof(assertion, { requireProofVersion: 'v2' })
```

`rank` is the safest cross-kind metric today. In strict validation it must be a
number from 0 to 100. If an application gives `rank` a specialised meaning, such
as "release safety" or "source confidence", document that meaning in the client
or provider profile.

## Subject choices

| Subject | NIP-85 kind | Helper | Subject tag |
| --- | --- | --- | --- |
| User pubkey | 30382 | `aggregateContributions` | `p` |
| Event id | 30383 | `aggregateEventContributions` | `e` |
| Addressable event, such as a long-form note or list | 30384 | `aggregateAddressableContributions` | `a` |
| External identifier, such as a package, domain, relay, or vendor id | 30385 | `aggregateIdentifierContributions` | `k` |

For kind 30385, the `k` tag is a decimal namespace chosen by the application
profile. nostr-veil validates the shape and binds it in proof v2; it does not
standardise every external namespace. Examples that use `k = 0` are placeholders
for an application-private profile, not a Nostr-wide package, domain, or vendor
registry.

## Detailed pages

Each page works through the subject shape, helper calls, metrics, verification,
security boundary, and policy choices for one use case:

| Use case | Status | Page |
| --- | --- | --- |
| User reputation and abuse reporting | Supported today | [user reputation and abuse reporting](./use-case-pages/user-reputation-abuse-reporting.md) |
| Source corroboration | Supported today | [source corroboration](./use-case-pages/source-corroboration.md) |
| Event and claim verification | Supported today | [event and claim verification](./use-case-pages/event-claim-verification.md) |
| Article, research, and long-form review | Supported today | [article and research review](./use-case-pages/article-research-review.md) |
| Relay and service reputation | Supported today | [relay and service reputation](./use-case-pages/relay-service-reputation.md) |
| Vendor and marketplace signals | Supported today | [vendor and marketplace signals](./use-case-pages/vendor-marketplace-signals.md) |
| Release, package, and maintainer reputation | Supported today | [release, package, and maintainer reputation](./use-case-pages/release-package-maintainer-reputation.md) |
| NIP-05, domain, and service-provider trust | Supported today | [NIP-05 and domain trust](./use-case-pages/nip05-domain-service-provider-trust.md) |
| Community list, labeler, and moderation-list reputation | Supported today | [list, labeler, and moderation-list reputation](./use-case-pages/list-labeler-moderation-list-reputation.md) |
| Federated moderation | Supported today | [federated moderation](./use-case-pages/federated-moderation.md) |
| Privacy-preserving onboarding | Supported today | [privacy-preserving onboarding](./use-case-pages/privacy-preserving-onboarding.md) |
| Grant, funding, and proposal review | Supported today | [grant, funding, and proposal review](./use-case-pages/grant-funding-proposal-review.md) |
| Anonymous credential or attestation co-signing | Future profile | [anonymous credential co-signing](./use-case-pages/anonymous-credential-attestation-cosigning.md) |
| Relay or community admission | Future profile | [relay or community admission](./use-case-pages/relay-community-admission.md) |

The runnable cross-check for these shapes is
[`examples/use-cases.ts`](../examples/use-cases.ts).

## Supported today

### User reputation and abuse reporting

- Use: kind 30382 user assertion.
- Subject: the account pubkey in `d`, optionally mirrored in `p`.
- Metrics: `rank`, and where useful NIP-85 user metrics such as
  `reports_cnt_recd`.
- Proof: proof v2 is supported, but v1 remains compatible.
- Example subject: `npub...` decoded to a 64-char hex pubkey.

This is the straightforward case: a moderation or trust circle rates a user
without naming which moderators or peers contributed. It supports abuse reports,
trust scores, trader reputation, and community standing.

Boundary: the proof does not establish that abuse happened. Cover that with the
community's evidence process, appeal path, report retention policy, and circle
admission rules. nostr-veil supplies the anonymous threshold signal those
processes can act on.

### Source corroboration

- Use: kind 30382 when the source has a Nostr pubkey, or kind 30385 for an
  external source identifier.
- Subject: the source pubkey or an agreed identifier such as
  `source:newsroom-a:case-2026-05`.
- Metrics: `rank` as confidence or reliability.
- Proof: proof v2 recommended for identifier subjects.

An editorial circle can say that enough trusted people have dealt with a source
or document trail before. This gives an editor a verifiable threshold signal
without storing the names of everyone who vouched.

Boundary: the proof is not a fact-check of the source's claim. Cover truth,
safety, and operational security with separate editorial review, evidence
handling, secure contact channels, and timing hygiene. nostr-veil supplies the
anonymous corroboration signal.

### Event and claim verification

- Use: kind 30383 event assertion.
- Subject: the event id in `d` and `e`.
- Helper: `contributeEventAssertion` and `aggregateEventContributions`.
- Metrics: `rank`, `comment_cnt`, `quote_cnt`, `repost_cnt`, `reaction_cnt`,
  `zap_cnt`, or `zap_amount`.
- Proof: proof v2 recommended.

Fact-checkers, moderators, or review circles can score a specific note, claim,
or announcement event. Clients can show the aggregate beside the event and
verify that a threshold of the circle contributed.

Boundary: the proof does not make the event objectively true. Cover methodology,
evidence, corrections, and dispute handling in the fact-checking profile.
nostr-veil binds the circle's assessment to a specific event id.

### Article, research, and long-form review

- Use: kind 30384 addressable assertion.
- Subject: a NIP-33 address in `d` and `a`, for example
  `30023:<author-pubkey>:paper-1`.
- Helper: `contributeAddressableAssertion` and
  `aggregateAddressableContributions`.
- Metrics: `rank`, `comment_cnt`, `quote_cnt`, `repost_cnt`, `reaction_cnt`,
  `zap_cnt`, or `zap_amount`.
- Proof: proof v2 recommended.

This covers long-form notes, research artefacts, grant applications, and any
other addressable Nostr object. A reviewer can be counted without being exposed
to the author, sponsor, or audience.

### Relay, service, vendor, and marketplace reputation

- Use: kind 30385 identifier assertion for non-Nostr subjects; kind 30382 if
  the vendor is just a Nostr pubkey.
- Subject: an agreed identifier such as `relay:wss://relay.example.com`,
  `vendor:market.example:alice`, or `service:blossom:example.com`.
- Helper: `contributeIdentifierAssertion` and
  `aggregateIdentifierContributions`.
- Metrics: `rank`, `comment_cnt`, or `reaction_cnt`.
- Proof: proof v2 recommended.

This lets clients compare relays, bots, moderation services, vendors, or
marketplace counterparties without forcing reviewers to reveal themselves.

Boundary: a single circle's score is not a universal registry. Cover registry
authority with application profiles, circle discovery, freshness rules, and
client policy. The assertion is portable because it is a Nostr event; its social
authority comes from the chosen circle.

### Release, package, and maintainer reputation

- Use: kind 30385 identifier assertion for packages, releases, repositories, or
  maintainers.
- Subject examples: `npm:nostr-veil@0.14.0`,
  `git:https://github.com/forgesworn/nostr-veil@36f74b0`, or
  `maintainer:github:forgesworn`.
- Helper: `contributeIdentifierAssertion` and
  `aggregateIdentifierContributions`.
- Metrics: `rank` as safety, review confidence, or maintenance confidence.
- Proof: proof v2 recommended.

Security reviewers can flag risky releases, compromised packages, suspicious
maintainer changes, or strong audit outcomes without exposing every reviewer to
the project, sponsor, or attacker.

Boundary: nostr-veil does not scan code or prove supply-chain safety. Cover
that with provenance, signatures, SBOMs, reproducible builds, CI, static
analysis, and human audit policy. nostr-veil carries the threshold-backed
reviewer signal.

### NIP-05, domain, and service-provider trust

- Use: kind 30385 identifier assertion.
- Subject examples: `nip05:alice@example.com`, `domain:example.com`,
  `lnurlp:alice@example.com`, or `nip96:https://upload.example.com`.
- Helper: `contributeIdentifierAssertion` and
  `aggregateIdentifierContributions`.
- Metrics: `rank`.
- Proof: proof v2 recommended.

Circles can rate identity domains, NIP-05 providers, upload services, payment
endpoints, or other external identifiers. This is useful when the thing being
scored is not a single Nostr pubkey.

Boundary: nostr-veil does not prove domain control. Cover that with DNS, HTTPS,
NIP-05, LNURL, or service-specific verification. nostr-veil carries the
circle's assessment of the identifier after those checks.

### Community list, labeler, and moderation-list reputation

- Use: kind 30384 if the list or labeler profile is an addressable Nostr event;
  kind 30382 if scoring the operator pubkey; kind 30385 if scoring an external
  feed or service.
- Subject examples: `30000:<pubkey>:trusted-relays`,
  `30000:<pubkey>:mute-list`, or `labeler:https://labels.example.com/main`.
- Helpers: `aggregateAddressableContributions`, `aggregateContributions`, or
  `aggregateIdentifierContributions` depending on the subject.
- Metrics: `rank`, plus supported event/addressable count metrics.
- Proof: proof v2 recommended for typed helpers.

Users can compare curation sources without creating a public graph of everyone
who reviews labelers, moderation lists, filter feeds, or community lists.

### Federated moderation

- Use: any supported assertion kind, but every circle must use the same subject
  and the same `scope`.
- Subject: usually a user pubkey or event id.
- Helper: create scoped circles with `createTrustCircle(members, { scope })`,
  aggregate each circle's event, then call `verifyFederation`.
- Scope format: lowercase slug using letters, digits, dot, hyphen, or
  underscore, for example `moderation.federation.example`.
- Metrics: whatever the underlying assertion kind supports.

Federation is for "count distinct people across several circles". If one person
belongs to three circles, their scoped key image is the same in all three, so
the federation counts them once.

This deliberately reveals cross-circle overlap by key image. If overlap
visibility is unacceptable, keep circles isolated and do not use a shared
`scope`. It still does not reveal the contributor's identity.

### Privacy-preserving onboarding

- Use: kind 30382 user assertion for the candidate account.
- Subject: the new account pubkey.
- Metrics: `rank` as admission confidence or community standing.
- Proof: proof v2 supported.

An existing circle can vouch that a new account passed its admission policy
without publishing which members vouched. The new account can point clients or
communities at that assertion.

This is not anonymous gated access by itself. Use it as a portable admission
signal today; add a separate challenge/response access handshake, expiry, and
revocation before calling it anonymous gated access.

### Grant, funding, and proposal review

- Use: kind 30383 for a proposal event, or kind 30384 for an addressable
  proposal record.
- Subject: the proposal event id or NIP-33 address.
- Metrics: `rank` as review score or confidence.
- Proof: proof v2 recommended.

Reviewers can score proposals, maintainers, milestones, or deliverables while
protecting themselves from pressure by applicants, sponsors, or communities.

## Future profiles

These are good fits for the design, but nostr-veil does not ship the whole
workflow yet.

### Anonymous credential or attestation co-signing

Today, a circle can score an event or addressable attestation with a NIP-85
assertion. That is enough to say "this circle rated this attestation highly".

A full anonymous endorsement profile needs an agreed event format for
credentials or attestations, including holder binding, what is being endorsed,
expiry, revocation, and presentation rules. Once that exists, proof v2 gives
the binding needed to keep the endorsement tied to the intended subject.

### Relay or community admission

Today, a circle can publish a threshold-backed assertion about a candidate
pubkey. A relay or community can use that as an input to admission policy.

A full anonymous admission flow needs a gated-access handshake outside NIP-85:
the verifier must check the proof without learning which trusted member opened
the door, and the transport must avoid leaking equivalent metadata. Until then,
publish a threshold-backed vouch assertion and let the relay or community apply
its ordinary admission policy.

## Recommended defaults

- Prefer proof v2 for new workflows.
- Use `validateAssertionStrict` for inbound NIP-85 events when compatibility
  with older extension tags is not required.
- Use `verifyProof(event, { requireProofVersion: 'v2' })` when replay across
  assertion classes would matter.
- Keep trust-circle admission, revocation, and rotation policies explicit.
- Treat identifiers as application-profiled strings, not as global truth.
- Avoid sensitive collection workflows that expose contributor IP, timing, or
  relay metadata.
- Pair every caveat with a mitigation: evidence workflow, canonicalisation,
  expiry, revocation, transport privacy, Sybil policy, or companion protocol.
