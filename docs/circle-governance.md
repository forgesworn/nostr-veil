# Circle governance for production deployments

nostr-veil proves that distinct members of a published ring contributed to an
aggregate. It does not prove that the ring is legitimate, independent, or safe
to act on. Production deployments need an explicit circle policy.

## Admission

- Publish who can join the circle and who approves membership.
- Require conflict-of-interest disclosure for high-impact decisions.
- Keep sensitive evidence outside the public assertion event.
- Use separate circles when one circle would concentrate too much authority.

## Rotation and revocation

- Give every circle a review cadence.
- Remove lost, compromised, inactive, or conflicted keys.
- Treat a membership change as a new circle ID.
- Keep clients on an allow-list of accepted circle IDs rather than trusting any
  ring that appears on a relay.
- Prefer machine-readable circle manifests so verifiers can reject expired,
  revoked, superseded, or wrong-profile circles without hand-written glue.

## Independence

- Define whether members must be independent people, teams, organisations, or
  systems.
- For federations, define which circles may participate and whether overlap is
  acceptable.
- Use scoped federation only when cross-circle deduplication is worth the
  privacy trade-off.

## Freshness and incident response

- Set a freshness window per use case. Abuse moderation may need short windows;
  package review may tolerate longer windows for immutable releases.
- Publish correction assertions when a subject is cleared, remediated, or
  re-reviewed.
- Have a recovery path for compromised contributors, bad evidence, or mistaken
  scores.

## Appeals and evidence

- Do not put private evidence into the nostr-veil event.
- Keep an evidence workflow, reviewer criteria, retention policy, and appeal
  process outside the proof layer.
- Make the client action proportional to the score and the circle authority.

## Verifier checklist

Use `createDeploymentPolicy()` and `verifyDeploymentPolicy()` with:

- accepted circle IDs or circle manifests;
- expected subject;
- expected subject hint where it is not the subject itself;
- proof v2 requirement;
- minimum distinct signer count;
- freshness window;
- metric bounds and required metrics;
- Nostr event signature verification for relay-fetched events;
- federation scope policy, when applicable.

Use `createCircleManifest()` for production circles. A manifest binds the
circle ID to the member list and records the allowed profile IDs, issue/expiry
times, superseded circles, revoked circles, policy URI, contact, and evidence
process. Treat manifests as signed or otherwise trusted deployment policy, not
as self-authenticating evidence from an arbitrary relay.
