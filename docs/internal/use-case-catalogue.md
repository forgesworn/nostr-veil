# Use-case catalogue

Internal planning note. This maps everything nostr-veil could plausibly be used
for and sorts it by how close each use is to working. It is deliberately wider
than the public atlas, and most entries are candidates, not promises. Do not
link it from the README, the public use-case atlas, or generated demo pages.
Promotion to a public page still goes through the gates in the
[future use-case delivery roadmap](./future-use-case-delivery-roadmap.md).

Checked on 2026-11-23 against nostr-veil 0.34.1 and `@forgesworn/ring-sig`
3.0.4. The [appendix](#appendix-what-was-run) lists what was run.

## How to read it

The catalogue is generated from the primitive, not from a list of sectors.
[The settings](#the-settings) lists everything the proof layer lets you choose:
the subject route, what the aggregate means, what the key image is scoped to,
who the circle is, and where the proof travels. Each
[pattern](#patterns) is one useful combination of those settings. The patterns
are meant to cover every useful combination. The applications listed under each
pattern are examples, and there will be more. An
[index by sector](#index-by-sector) is at the end.

Every application has a tier:

| Tier | Meaning |
| --- | --- |
| Atlas | Has a public worked page, with profile, example and relay evidence. |
| Ready | Uses the shipped API and passes strict NIP-85 validation. It needs a subject convention, and the atlas apparatus before it can be public. Marked Ready only when it has the same shape as an atlas example or was run for this note. |
| Loose | `verifyProof` accepts it, but it uses a metric name outside the strict NIP-85 list, so `validateAssertionStrict` and the profile verifiers reject it. |
| Companion | The proof works. A protocol around it does not exist yet: a handshake, a case format, a way to issue the ring, or a transport. |
| Extension | Needs a change to nostr-veil, using cryptography `ring-sig` already has. |
| Research | Needs cryptography neither library has. |
| Avoid | The wrong tool, or the harm outweighs the use. |

Every application also names its binding constraint, the one limit most likely
to stop it. The words used are:

| Word | Meaning | Limit |
| --- | --- | --- |
| roster | The member list is visible to every verifier. | 1 |
| values | Each contributed value is public. | 2 |
| size | Ring size times signer count must fit a relay event and a verifier's patience. | 3 |
| bounds | One member can skew `sum`, `mean`, `min` or `max`. | 4 |
| omission | The aggregator chooses which contributions to publish. | 5 |
| coercion | A key holder can prove, or be made to prove, what they signed. | 6 |
| raw key | Members need the private key in the signing process. | 8 |
| metric | Strict NIP-85 metric names, and `rank` from 0 to 100. | 9 |
| bearer | The proof is not tied to whoever presents it. | 11 |
| one-per-subject | Nothing limits a member across subjects. | 12 |
| curation | The roster is only as good as whoever admits members. | README threat model |
| transport | Collecting contributions leaks timing and network metadata. | README threat model |
| legal | Naming a person or organisation in a public event exposes the publisher to defamation and data-protection claims. | none |

## The fit test

Seven questions. A strong fit answers yes to all of them.

1. **Is there a roster?** A finite list of keys with standing to speak: a team,
   a panel, a membership, a set of credential holders. No roster, no ring.
2. **Is contributing the risky part?** Either the contributor could face
   retaliation, or the act itself gives something away: that they are a
   customer, a patient, a member of staff, at a place, or holding funds
   somewhere.
3. **Does the number of distinct contributors matter?** Duplicate detection is
   what LSAG adds. If one voice is enough, pattern P6 still applies. If nobody
   needs to count or to check membership, an ordinary anonymous post is simpler.
4. **Can each value be public?** Who said it is hidden. What was said is not.
5. **Can verifiers see the roster?** Either the roster can be public, or the
   proof stays inside the group, or members enrol per-circle keys.
6. **Can nobody demand keys or alibis, and will nobody need to unmask a
   contributor later?**
7. **Is it small?** Up to about 25 members when everyone signs, or a bigger
   ring with few signers: 7 at 100 members, 2 at 250.

## The settings

### Subject route

| Route | Kind | Subject | Note |
| --- | --- | --- | --- |
| Pubkey | 30382 | A Nostr key: a person, agent, service or organisation. | The only route where the subject can sit in its own ring. Read `independentSigners`. |
| Event | 30383 | One immutable event: a claim, a post, a motion, a submission. | The route for statements and decisions. |
| Address | 30384 | A replaceable record: an article, list, listing, community or release. | The record can change after it is scored, so pin a revision in policy. |
| Identifier | 30385 | Anything else, as a NIP-73 identifier or an agreed string. | Carries the period, slot or case id for the per-period patterns. NIP-73 already has `web`, `doi`, `isbn`, `geo`, `iso3166`, and blockchain transactions and addresses. |

### What the aggregate means

| Setting | Reads as | Who can move it |
| --- | --- | --- |
| `median` (default) | The circle's consensus score. | Half the signers. |
| `mean` | An average. | Any one signer, by the size of their value. |
| `sum` | A tally, if every ballot is 0 or 1. | Any one signer. Nothing checks a ballot's range (limit 4). |
| `min` | A veto or weakest link: one low value wins. | Any one signer, by design. |
| `max` | An alarm: one high value wins. | Any one signer, by design. |
| Custom function | A trimmed mean and the like. | Depends on the function. The verifier must be given the same one. |
| Ignore the metric and read `distinctSigners` | A head-count: a quorum, a petition, a co-signature. | Nobody. It is the count of distinct key images. |
| One signer | "A member of this ring stands behind this." | Not applicable. |

### Key-image scope

| Scope | How | One contribution per member per |
| --- | --- | --- |
| Circle and subject (default) | Nothing to set. | Subject, within one exact roster. Unlinkable across subjects and across rosters. |
| Shared scope and subject | `createTrustCircle(members, { scope })` | Subject, across every circle that shares the scope. Overlap between those circles becomes visible. |
| Period in the subject | An identifier such as `pulse:team.example:2026-W47` | Period. Each period gives a fresh, unlinkable key image. |
| Slot in the subject | `access:example.com:2026-11-23:slot-3` | Slot, so k per period by numbering k slots. Same mechanism as the row above. |
| Not available | | Scope alone, whatever the subject. The election id always contains the subject (limit 12). |

Under proof v2 the kind and the subject tag are part of the election id too, so
the same subject string under another kind gives another key image.

### Who the circle is

| Circle | Typical size | What it adds | Watch for |
| --- | --- | --- | --- |
| Curated panel: moderators, reviewers, a board | 5 to 25 | A named curator and clear standing. | A small anonymity set. |
| Whole roster: staff, members, a cohort, a DAO | 10 to a few hundred | Everyone with standing can speak. | Size (limit 3). The roster may be sensitive. |
| Credential holders: verified people, licensed professionals, ticket holders, buyers with a completed order | Grows over time | Standing comes from an issuer. | Needs someone to issue the ring, and a rolling roster (P10). |
| Ad-hoc ring chosen by the signer | Any | No setup and no consent. Any set of x-only secp256k1 keys works. | It puts people who did nothing into the suspect pool. Raw key (limit 8). |
| Per-circle keys | Any | The roster does not show main identities. `nsec-tree` derives such keys. | Outsiders must take the curator's word for who is behind each key. |
| Organisations, one key each | 5 to 100 | Consortium signals: "N distinct firms". | Who inside the organisation holds its key. |
| Machines: an agent fleet, oracle nodes, probes, vehicles | Any | Hides which instance acted. | Keys are free, so a human must curate the roster. |

### Where the proof travels

| Path | Roster visible to | Use when |
| --- | --- | --- |
| Public relay | Everyone | The signal should be portable and the roster can be public. |
| Inside a group's own encryption | Members only | The roster is private and the verifiers are the members (P12). |
| Handed to one verifier | That verifier | Passes and gates (P9). |
| Offline or mesh | Whoever holds the event | Verification needs no lookup. The ring travels in the event. |

## Hard limits

These add to the threat model in the README. Each one changes which tier an
application lands in. "Run" means the behaviour was reproduced for this note.

1. **The roster is visible to every verifier.** The `veil-ring` tag lists every
   member key. A circle of clinic patients, abuse survivors or the members of a
   private community is exposed by its own proof. The options are to keep the
   event inside the group (P12), to enrol per-circle keys so the roster shows
   only those, or to pad the ring with a wider population, which weakens what
   membership means.

2. **Each contributed value is public.** Every contribution's signed message is
   in its `veil-sig` tag, so anyone can read every value. Run: `[90, 90, 20, 20]`
   read back from a published event. In a small ring a distinctive value, or two
   metrics in one contribution, can identify the contributor. Contribute one
   coarse value per subject.

3. **Size and time grow with ring size times signer count.** Each signature
   carries one response per ring member.

   | Ring | Signers | Event size | Verify time |
   | ---: | ---: | ---: | ---: |
   | 5 | 3 | 3.7 KiB | 0.07 s |
   | 10 | 7 | 10.1 KiB | 0.3 s |
   | 12 | 12 | 18.3 KiB | 0.7 s |
   | 20 | 20 | 41.0 KiB | 1.8 s |
   | 50 | 10 | 43.6 KiB | 2.2 s |
   | 50 | 25 | 103.3 KiB | 5.4 s |
   | 100 | 1 | 14.4 KiB | 0.4 s |
   | 100 | 5 | 43.8 KiB | 2.2 s |
   | 100 | 10 | 80.5 KiB | 4.3 s |
   | 100 | 50 | 374.6 KiB | 21.8 s |
   | 250 | 5 | 104.1 KiB | 5.5 s |
   | 1000 | 1 | 133.9 KiB | 4.5 s |
   | 1000 | 3 | 269.9 KiB | 13.3 s |

   The figures fit `bytes = signers × (69 × ring + 630) + 67 × ring + 500` and
   `seconds = 0.0044 × ring × signers`, for one metric and a short subject on an
   Apple M4 Max. Signing one contribution costs the same as verifying one.
   Phones were not measured and will be slower.

   Stock strfry rejects events over 65,536 bytes (`maxEventSize`). Seven public
   relays that answered a NIP-11 query advertise websocket frame limits from
   128 KiB to 4 MB, but a frame limit is not an event limit, so treat 64 KiB as
   the portable budget. Inside it: everyone signs up to about 25
   members, 15 signers at ring 50, 7 at ring 100, 2 at ring 250, and one signer
   up to a ring of about 470. The hard cap is 1,000 members.

   So nostr-veil is a small-circle tool today. A verifier should check the
   circle id and the publisher against its accept-list before running ring
   verification, because a 64 KiB event costs seconds of CPU and anyone can post
   one. Sharding (P10) eases the event size, not the total verification cost.

4. **One member controls `sum`, `mean`, `min` and `max`.** Key images stop a
   member signing twice. Nothing stops a member signing one large value. Run:
   five ballots `[1, 0, 0, 0, 3]` summed to a `rank` of 4 with 5 distinct
   signers, and passed `verifyProof` and strict validation. A deployment policy
   bounding `rank` to 0 to 5 accepted it too, because `metricPolicies` bound the
   published aggregate, not each contribution. Until
   the verifier checks each contribution's range, a tally consumer has to parse
   the signed messages and check every ballot, or count `distinctSigners` on an
   assertion that only supporters sign. `median` needs half the signers to move
   it, which is why it is the default.

5. **The aggregator can leave contributions out.** Run: four contributions
   `[90, 90, 20, 20]` gave a median of 55. Publishing only the first two gave
   90, with a valid proof and an honest `veil-threshold` of 2 of 5. A dropped
   contributor can see their key image is missing, and can give the same
   contribution to another publisher or publish it alone (P10). A reader of one
   event cannot tell. Verifiers that care should require a minimum turnout, or
   count across several publishers under a shared scope.

6. **Whoever holds a member's key can find that member's contributions.** The
   key image depends only on the private key and the election id. Run:
   `computeKeyImage` reproduced a signer's key image from a published event, and
   a non-signer's did not appear. Three things follow.
   - A key seized or leaked later exposes every past contribution made with it.
   - A member can prove what they signed, so a vote can be sold. A non-signer
     can prove they did not sign, so an employer can ask the whole roster for
     alibis and find the one person who cannot give one.
   - A member who scores the same subject again is linkable across versions,
     because the key image is the same.

   The mitigations are partial: per-circle keys destroyed after use, short-lived
   circles, and staying away from settings where someone can compel keys. This
   rules out binding ballots and weakens every whistleblowing entry below.

7. **No opening and no retraction.** Nobody can unmask a contributor, the
   circle's curator included. A contribution cannot be withdrawn, except by the
   publisher aggregating again without it. Settings that need due process
   against a named accuser need something else.

8. **Signing needs the raw private key.** `contributeAssertion` takes the key as
   a hex string, and nostr-veil has no way to call an external signer. Browser
   extensions, generic remote signers and Android signers offer event signing
   and encryption, not the scalar arithmetic LSAG needs. Heartwood's changelog
   lists a `heartwood_lsag_sign` NIP-46 method (0.6.0), which is the exception
   and is not wired in here. So a member either pastes a secret key into the app
   or enrols a per-circle key the app holds. The second is the practical route,
   and it means rings over people's main Nostr keys are mostly out of reach for
   ordinary users today.

9. **Strict NIP-85 allows few metric names, and `rank` runs from 0 to 100.**
   Kind 30385 accepts `rank`, `comment_cnt` and `reaction_cnt` only. Any other
   name verifies at the proof layer and passes loose validation, but fails
   strict validation and the profile verifiers. Run: `day_rate_pence`. Anything
   that is not a 0 to 100 score is therefore Loose, and a `sum` over `rank`
   stops at 100.

   The `k` tag has a narrower version of the same gap. A NIP-73 typed
   identifier (`doi`, `geo`, `web`, a blockchain address) passes strict
   validation, `verifyProof` and `verifyUseCaseProfile` (run). But
   `validateUseCaseProfileDefinition` rejects a kind 30385 profile whose
   `subjectTagValue` is not decimal, and every atlas page has to pass that
   check. So a row below that names a NIP-73 type works today, and to become an
   atlas page it either uses the `k = 0` convention with the type inside the
   identifier string, or waits for that rule to be relaxed.

10. **One live event per publisher, kind and subject.** Assertions are
    addressable, so a publisher's new event for a subject replaces the old one
    on relays. History and second rounds need archiving, or a round suffix in
    the subject. Shards of one count need different publisher keys.

11. **The proof is not bound to whoever presents it.** The outer Nostr signature
    is the publisher's, and the circle does not sign it. Run: the same proof
    tags signed again by a different key verified. A proof used as a pass is a
    bearer token, and whoever sees it can present it. Hand it over a private
    channel, and put the verifier's name and the period in the subject. The
    admission helpers avoid this by making the applicant's key the subject,
    which is also why that gate is not anonymous.

12. **One contribution per member per subject, never per scope alone.** A member
    can contribute to as many subjects as they like, and those contributions
    cannot be linked. That is the privacy property. It is also why nothing here
    can cap vouches per member, enforce "choose exactly one", or hold a member
    to one pseudonym.

## Patterns

The seventeen atlas pages sit in five of the patterns:

| Pattern | Atlas pages |
| --- | --- |
| P1 | User reputation and abuse reporting, source corroboration, event and claim verification, article and research review, relay and service reputation, vendor and marketplace signals, release and package reputation, NIP-05 and domain trust, verifier and issuer legitimacy, list and labeler reputation, grant and proposal review |
| P2 | Privacy-preserving onboarding, AI agent trust, relay or community admission |
| P4 | Anonymous group decisions |
| P7 | Anonymous credential or attestation co-signing |
| P10 | Federated moderation |

### P1. Consensus score on a subject

A panel scores one thing and the median is published. Settings: any route,
`median` or `mean`, circle scope, a curated panel or a whole roster. The rows
below reuse the atlas shapes with a new subject convention, so they are Ready
unless marked. Each still needs its own controls, as the atlas pages do.

Nostr-native subjects:

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Ecash mint reliability | Users or auditors of the mint | The mint URL as a `web` identifier, or its NIP-87 announcement (kinds 38172, 38173) by address | A signed review shows where you keep funds | Ready | curation: who counts as a user |
| Lightning service providers and wallet back ends | Customers, node operators | A `web` identifier | It shows which provider you depend on | Ready | curation |
| Client apps and NIP-89 handlers | Security reviewers | The handler record (kind 31990) by address | Pressure from app authors | Ready | curation |
| DVMs and paid APIs | Paying customers | The service pubkey, or a service identifier | It shows what you buy | Ready | curation |
| Single listings and classifieds | Buyers, market moderators | The listing by address (kinds 30018, 30402) | It shows what you bought | Ready | legal |
| Job posts, bounties and clients | A freelancers' guild | The post by address, or the client pubkey | Fear of losing future work | Ready | legal |
| Communities and groups | Members and former members | The community definition (kind 34550) by address | The moderators can remove you | Ready | roster |
| Wiki entries and competing forks | Subject experts | The entry by address (kind 30818) | Keeps disputes about the text | Ready | curation |
| Protocol proposals | Client and relay developers | The draft by address, or an agreed identifier | Honest implementer sentiment without public politics | Ready | curation |
| Score providers and other circles | Auditors | The provider pubkey, or a `circle:<id>` identifier | Retaliation from the provider | Ready | curation |

Software, security and infrastructure:

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| MCP servers, agent tools and skills | Security reviewers | A package identifier from the canonical helpers | As for package review | Ready | curation; companion evidence still applies |
| Model weights, data sets and firmware images | Reviewers | A digest identifier | As for package review | Ready | curation |
| Reproducible-build confirmations | Independent rebuilders, each signing only if their hash matched | A digest identifier. Read `distinctSigners`, or use `min` so one mismatch shows | Little. Rebuilders usually sign in the open | Ready | curation |
| Vulnerability confirmation before disclosure | Vetted researchers | An advisory identifier | Named researchers attract legal threats | Ready | legal |
| Exchanges, custodians and trading platforms | A traders' guild | A `web` identifier | It shows where you trade | Ready | legal |
| Hardware, hosting and VPN providers | Security reviewers | A `web` identifier | Vendor pressure | Ready | legal |

People in roles:

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Moderators and admins, rated by their community | Community members | The moderator pubkey | The moderator can ban you | Ready | roster |
| Peer review inside a team | The team | A teammate's pubkey | You work with them tomorrow | Ready | The subject is in the ring, so read `independentSigners` or use a ring without the subject (run). Very small rings |
| Employers and managers | Verified staff | A `web` identifier, or a pubkey | Retaliation | Ready | roster, values, legal |
| Landlords, agents and contractors | A tenants' association | An agreed identifier | Retaliation, eviction | Ready | legal |
| Courses, teachers and supervisors | The enrolled cohort | The course record by address | Marks and references are in their hands | Ready | roster |
| Investors, funders and grant programmes | Past applicants | A `web` identifier | Fear of being blacklisted | Ready | curation |
| Event organisers and speakers | Ticket holders | The event record by address | Small scenes, long memories | Ready | legal |
| Ride-hailing and delivery counterparties | People who completed a trip or order with them | The counterparty pubkey | A rating proves you took that trip | Companion | Someone must issue the ring from completed jobs and keep it rolling (P10) |
| Verified-purchase reviews in general | Buyers added after settlement | The vendor or listing | It shows what you bought | Companion | As above |
| Clinician peer rating | Credentialled peers | | | Research | See the roadmap. Due process may require opening (limit 7) |

Places and works:

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Venues and places: safety, accessibility | A local community group | A `geo` identifier, or the venue URL | A review shows where you go | Ready | curation |
| Papers and data sets | Society members, an editorial board | A `doi` identifier | Junior researchers criticising senior ones | Ready | curation |
| Competition and hackathon entries | Judges | The entry event | Lobbying of judges | Ready | A trimmed mean is a custom aggregate, so the verifier needs the function (run) |
| Blind double-marking and peer assessment | Markers | The submission event | Marker independence | Ready | Very small rings |

### P2. Vouch for a key

A circle stands behind a key. The count of vouchers matters more than the value.
Settings: pubkey route, circle scope.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Skill and trade endorsement | Guild masters | The apprentice's pubkey | Small guilds, awkward refusals | Ready | curation |
| Reference checks | Referees the candidate nominated | The candidate's pubkey | Honest references | Ready | Very small rings; values |
| Contributor access | Maintainers | The contributor's pubkey | Nobody becomes "the one who let them in" | Ready | curation |
| Seller or merchant onboarding | Existing sellers | The seller's pubkey | Commercial rivalry | Ready | curation |
| Savings groups and peer lending | Group members | The borrower's pubkey | Social pressure on guarantors | Ready | legal |
| Personhood by social vouching | Verified people | The newcomer's pubkey | Pressure to vouch | Ready as a signal. Research for Sybil resistance | one-per-subject: no cap on vouches per member |
| A member vouches for their own throwaway key | Any circle, one signer | The throwaway pubkey | The member stays hidden | Ready, but it proves little | one-per-subject: unlimited pseudonyms per member. One per member is an Extension |
| Key succession: "the new key is the same person" | Contacts | The new pubkey | Little. A named attestation is worth more here | Avoid | |

### P3. Flags and warnings that surface at a threshold

Members flag a subject. The collector holds the flags until K distinct members
agree, then publishes, and the count is the message. Settings: any route, read
`distinctSigners` or use `max`, circle scope. The collector sees early flags,
though not who sent them. Removing that trust is Research.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Misconduct reports that surface only at K distinct reporters | A community, conference or project roster | A pubkey, or an agreed identifier | Retaliation, and nobody wants to be first | Ready | legal: it names a person; transport |
| Hazard and near-miss reports | The staff roster | An identifier for the place, machine or procedure | Blame culture | Ready | transport |
| Redemption or withdrawal failures at a mint or custodian | Users | The mint or custodian identifier | It shows where you hold funds | Ready | curation. A false alarm can start a run |
| Censorship and outage sightings from hostile networks | Vetted volunteers | An identifier with the target and date | Personal safety | Ready | transport is the whole risk; roster |
| Scam payee flags | Member firms or traders | A `web` URL, or a blockchain address identifier | Admitting you were targeted | Ready | legal; needs an appeal route |
| Threat-intelligence sightings | Member organisations, one key each | An indicator hash as an identifier | Admitting a compromise | Ready | curation |
| Concerns about a maintainer or a key | Maintainers | The canonical maintainer subject | Confronting a colleague | Ready | legal |
| Emergency pause calls | A security council | An identifier for the system | Responders become targets | Ready | curation |
| Counterfeit and product-safety reports | Professionals such as pharmacists or inspectors | A product identifier | Supplier retaliation | Ready | curation |
| Media-hash takedown quorums for media servers | Trusted flaggers | A blob hash as an identifier | Flagger safety | Ready mechanically | Never on public relays: a public list of flagged hashes is an index of the material. legal |

### P4. Tally a decision

Settings: event or identifier route, `sum` or `distinctSigners`, circle scope.
Every `sum` row carries limit 4. For an election that needs ballots encrypted
until the close, use a dedicated protocol such as `nostr-anon-vote` instead of
stretching NIP-85.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Board, committee and maintainer resolutions | The body | The motion event | Pressure on individual members | Atlas, as a building block | bounds; coercion |
| Jury and arbitration verdicts: market disputes, moderation appeals, anti-cheat review, mutual-aid claims | A panel | A case identifier | Retaliation from the losing side | Companion | Needs a case format, a deadline and a quorum rule. coercion: a juror can prove their vote |
| Temperature checks, retrospectives and pulse polls | A team or community | An identifier with the period | Candour | Ready, as a `median` of 0 to 100 | Very small rings |
| Approval voting among candidates | The electorate | One subject per candidate | Pressure | Ready | bounds; one-per-subject: "at most one candidate" cannot be enforced |
| Plurality, ranked and score ballots | The electorate | One event with a metric per option | Pressure | Loose | metric; bounds |
| Weighted votes | One circle per weight class | The motion | Pressure | Companion | It reveals each ballot's weight class. The verifier applies the weights |
| Budget allocation and quadratic voting | | | | Research | one-per-subject |
| Statutory or binding secret ballots | | | | Avoid | coercion |

### P5. Veto and objection

One anonymous objection is enough. Settings: any route, `min` or a one-signer
refusal read as `distinctSigners` of at least 1, circle scope. `epoch-seal`
already does this for key-recovery requests, with ring-signed refusals from
`nostr-anon-vote`.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Blackball admission: "does anyone object?" | Members | The candidate's pubkey, or a case id | Objecting to a friend of a friend | Ready | Very small rings |
| Consent rounds | A team | The proposal event | Dissent under hierarchy | Ready | Very small rings |
| Stop-the-line on a release or deployment | Engineers | A release identifier | Blame | Ready | curation |
| Recovery refusal windows | Custodians | A request id | Someone may be standing over the owner | Ready here. Shipped in `epoch-seal` | coercion |
| Unanimity checks | The body | The motion | Pressure | Ready: require full turnout and a `min` of 1 | size |

### P6. Authenticate an anonymous statement

The original use of a ring signature. One member stands behind a message, and
readers learn only that it came from inside the ring. Here the message is a
Nostr event and the proof is a one-signer assertion about its id. Settings:
event route, one or two signers, circle scope, often an ad-hoc ring. Profile
validation warns below three signers, and that warning is deliberate. Limits 6
and 8 bite hardest here.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Leak authentication: "someone inside wrote this" | An ad-hoc ring of insiders' keys | The statement event | Career, liberty | Ready mechanically | raw key; coercion by alibi; the other ring members did not consent |
| Two-source confirmation | The insider ring | The claim event, with `distinctSigners` of at least 2 | As above | Ready | As above |
| Verified-profession posts: "a registered nurse wrote this" | Credential holders | The post event | Professional sanction | Companion | Someone must issue the ring from a register |
| Referee reports with a proven reviewer pool | A programme committee | The report event | Author retaliation | Ready | Very small rings |
| Staff questions to leadership | The staff roster | The question event | Candour | Ready per question. Extension to cap questions per person | one-per-subject |
| Insider-only tip inbox | The staff roster | The tip event, sent privately | Source protection | Ready | transport. Pair it with a private carrier such as `nostr-deaddrop` |
| Anonymous now, claimable later: contest entries, blind auditions, bounty reports | Entrants or members | The submission event | Being judged on the work | Ready | A second signature on the same subject shares the key image, which ties the claim to the entry (run) |

### P7. Count distinct supporters

The metric is ignored and `distinctSigners` is the message: N distinct members
put their names to this, without the names. Settings: any route, count, circle
or shared scope.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Petitions and open letters | Staff, members, a faculty | The letter event | Signing is the risk | Ready within the size limit. Shards beyond it (P10). Research for thousands | size |
| Co-signed advisories and statements | Maintainers, a board | The statement event | Individual targeting | Ready | curation |
| Release and merge sign-off quorums | Maintainers | A release identifier | "Who approved it" pressure | Ready | curation |
| Attendance, delivery and witness confirmations | Ticket holders, recipients | An event or order identifier | Attendance is private | Ready | curation |
| Field confirmations of an incident | A press club, monitors | An incident identifier | Safety | Ready | transport |
| Milestone acceptance that triggers a payout | Reviewers | A milestone identifier | Applicant pressure | Companion | Something must turn a verified proof into a payment |

### P8. Anonymous measurement

Members report a number and the median is published. Settings: identifier route
with the period in the subject, `median`, circle scope. Ready when the number
fits `rank` from 0 to 100, and Loose otherwise (limit 9). Limit 2 always
applies: every reported value can be read.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Morale, safety-culture and satisfaction pulses | A team | An identifier with the period | Candour | Ready | Very small rings |
| Forecasting and Delphi panels | Experts | A question id with the round | Delphi depends on experts not knowing whose estimate is whose | Ready, with a probability as 0 to 100 | curation |
| Estimation rounds | A team | An item id | Anchoring on the first number | Ready | Very small rings |
| Pay and day-rate benchmarks | A guild or staff roster | An identifier with the period | Pay secrecy | Loose | metric; values: a distinctive figure identifies its owner |
| Street exchange rates and local prices | Vetted traders | A currency pair and date | Reporting can be illegal | Loose | metric; transport; roster |
| Rents, medical bills and bribes paid | Tenants, patients, residents | An identifier with the area and period | Retaliation | Loose | metric; curation |
| Parallel vote tabulation | Accredited observers with per-circle keys | The election and polling station | Observer safety | Loose | metric; roster; transport |
| Incident counts from field monitors | Monitors | An incident identifier | Safety | Loose | metric; transport |
| Peer bonus scores | A team | A teammate's pubkey | Office politics | Ready as a score per peer. Research for a fixed budget split across peers | one-per-subject |
| Sealed bids and private pay data | | | | Research | values |

### P9. Per-period limits, passes and lotteries

Put the period in the subject and the key image becomes a tag that each member
can produce once per period. Settings: identifier route, one signer, period or
slot scope, usually handed to one verifier. This is the mechanism under the
roadmap's full anonymous admission item. Limits 11 and 12 are why it is not
finished.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| One response per member per survey or period | The roster | The survey id | Candour | Ready | Very small rings |
| A one-per-period pass shown to a gatekeeper: relay write access, members-only content, an API quota | Members or subscribers | `access:<verifier>:<period>` | The gatekeeper does not learn which member | Companion | bearer; needs a handshake; about 4.4 ms per ring member per check |
| k passes per period | As above | Numbered slots | Slots cannot be linked to each other | Companion | bearer |
| Age or eligibility gates: "one of these verified adults" | Credential holders with per-circle keys | The verifier and period | The site learns nothing else | Companion | Someone must issue the ring; a member can lend a pass; rings stop at 1,000 |
| Ticket check-in with double-entry detection | Ticket holders | The event id | Attendance is private | Companion | size: time at the door for a large ring |
| Seat licensing: "one of 50 seats, each active once per period" | Licensed keys | The product and period | The vendor cannot profile use per seat | Companion | bearer |
| Subscriber-private reading and listening | Paid subscribers | The publisher and period | The publisher cannot tie what was read to a subscriber | Companion | bearer |
| One claim per member: faucets, vouchers | Members | A claim id and period | Privacy of the claimant | Companion as a bearer claim. Extension to bind the claim to a payout key | bearer |
| One pseudonym per member per community | Members | | Anonymous accounts that are not free | Extension | one-per-subject |
| Rate-limited anonymous posting | Members | | Candour without spam | Extension | one-per-subject |
| Lottery and sortition: order members by the hash of their key image | The roster | A draw id that nobody in the ring chose, for example one derived from a public random value | Jurors or winners stay anonymous until they act | Companion | Not analysed formally. Needs a convention and a small check outside the library |

### P10. Federation, shards and rolling rosters

A shared `scope` keeps a member's key image the same across circles. Settings:
any route, any aggregate, shared scope. The price is always the same: anyone can
see that one contributor signed in several circles.

| Application | Circle | Tier | Binding constraint |
| --- | --- | --- | --- |
| Cross-community moderation | Several moderator teams | Atlas | Overlap is visible |
| Coalition head-counts | The rosters of several organisations | Ready | Overlap is visible |
| Chapters or regions voting on one motion | One circle per chapter | Ready | bounds |
| Cross-faction agreement: a threshold from each of two or more circles that usually disagree | One circle per viewpoint | Ready. Verify each circle's event alone, then require all of them. No shared scope is needed unless overlap matters | curation: who defines the factions |
| Rolling rosters: members join and the one-per-member rule survives | Successive rosters under one scope | Ready (run) | Old and new rosters are both public |
| Sharded counts: several events, each under the relay limit | One scoped circle with several publishers | Ready (run) | size: total verification time is unchanged. Splitting into sub-circles instead shrinks the anonymity set to the shard |
| Self-published contributions: each member publishes a one-signer event and there is no aggregator | One scoped circle | Ready for counting (run). Extension to combine the values | Each event repeats the ring, so the total size grows. It removes limit 5 |

### P11. Periodic liveness and canaries

Settings: identifier route with the period in the subject, count, per-period
scope. Each period's key images cannot be linked to the last, so nobody can see
whether the same people signed.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Threshold warrant canary: K of N staff attest each period | Staff who would know | `canary:<org>:<period>` | Someone served with an order can stay silent without being singled out | Ready | coercion: whoever served the order can ask who signed; curation |
| Dead-man quorum: "K of N trustees are still reachable" | Trustees | An identifier with the period | No log of who checked in | Ready | curation |
| Renewing confidence votes | A board | An identifier with the period | Pressure | Ready | bounds, if summed |
| Circle liveness: how many members are still active | The roster | An identifier with the period | No activity log per member | Ready | curation |

### P12. Inside a private group

A way of deploying the other patterns more than a pattern of its own. Any row
above can run with the proof kept inside the group's own encryption. The roster
is the group and the verifiers are the members. Nothing reaches a public relay,
so limit 1 stops mattering. The proof layer does not care how an event travels,
but there is no wrapping helper and no host integration, and nothing here was
run, so every row is Companion.

| Application | Tier | Binding constraint |
| --- | --- | --- |
| Anonymous flags to moderators in a private community | Companion | The host app must carry and verify the event. Very small rings |
| Workspace polls, retrospectives and feedback | Companion | As above |
| Anonymous objections in a family or a few friends | Avoid | The ring is too small to hide anyone |

An app that already gives each member a per-circle key also removes limit 8,
because the app holds that key.

### P13. Machines as members

Settings: any route, any aggregate, circle scope, a roster of machines. Keys are
free, so a named human or organisation must curate the roster. An agent-only
circle proves nothing.

| Application | Circle | Subject | Why hide the contributor | Tier | Binding constraint |
| --- | --- | --- | --- | --- | --- |
| Fleet anonymity: an instance acts and nobody learns which | An operator's fleet | Any | It stops instances being fingerprinted or targeted | Ready, per the AI agent atlas page | curation |
| Oracle and probe committees: a median price, outcome or reachability | Independent nodes | An identifier with the period | A known node can be bribed or attacked | Ready as 0 to 100. Loose for raw prices | metric |
| Evaluator panels: independent judge models score an output | Evaluators run by different operators | The output event | The evaluated party cannot tune to one judge | Ready | curation |
| Vehicle and sensor reports: K distinct reporters confirm a road hazard | Vetted reporters | An agreed identifier built on a geohash, with the type and a time bucket | A report shows where you were | Ready | roster; transport |

## What would unlock more

Changes to nostr-veil that need no new cryptography:

| Change | Unlocks |
| --- | --- |
| Per-contribution value bounds in `verifyProof` or deployment policy | Safe `sum` and `mean` tallies, and plurality and score ballots (P4) |
| A signed payload that is not part of the election id: sign an event id or a public key under an election id built from the scope alone | Passes bound to a session or a payout key, one pseudonym per member, rate-limited posting, question caps (P6, P9) |
| An external-signer interface here, and LSAG in more signers than Heartwood | Ordinary users without pasted secret keys, and rings over main Nostr keys (limit 8) |
| NIP-73 `k` types accepted in profile definitions | Atlas pages for `doi`, `geo`, `web` and blockchain-address subjects without the `k = 0` convention (limit 9) |
| A helper that combines the values of one-signer events | Publication with no aggregator (P10) |
| A wrap and unwrap helper for group-encrypted proofs | Private-group mode (P12) |
| Faster verification: native code or WASM, and batching | Feeds, phones and larger rings (limit 3) |
| A tally metric that is not `rank` | Sums above 100 (limit 9) |
| A ballot and motion format | Already on the roadmap |

Cryptography neither library has:

| Missing piece | Unlocks |
| --- | --- |
| Compact membership proofs, logarithmic or constant in the ring size | Mass petitions, and rosters in the thousands |
| k-times linkability | Vouch budgets and bounded multi-vote. This is the roadmap's k-LRS question |
| Hidden values with a verifiable sum, from commitments and range proofs. `range-proof` is a separate ForgeSworn library and is not wired in | Sealed bids, tally-only ballots, private pay data |
| Receipt-freeness | Binding ballots, and juries that cannot be bought |
| Opening by an authority or a threshold of authorities | Regulated peer review, and deterrence of abuse |
| Membership proof against a hidden roster | Patient, survivor and source circles on public relays |
| Threshold-matched disclosure with no trusted holder | Misconduct escrow where nobody sees the early reports |
| Forward-secure or deniable signing keys | Protection after a key is seized (limit 6) |
| Linkability across a set of subjects | "Choose exactly one", and fixed budgets across subjects |

## Poor fits

- **Open populations.** No roster, no ring. Public review sites and general
  elections are out.
- **Very small rings.** In a ring of four, three people comparing notes identify
  the fourth, and a distinctive score does the same job without them.
- **Rosters that are themselves the secret, on public relays.** See limit 1.
- **Anything that needs coercion resistance.** Binding ballots, and juries
  someone would pay to buy.
- **Anything that needs unmasking later.** See limit 7.
- **Secret values.** Bids, individual pay, anything where the value is the
  sensitive part.
- **High-frequency use.** A proof per chat message or per request costs
  kilobytes and tens to hundreds of milliseconds each.
- **Mass scale.** See limit 3.
- **Accusations against named private individuals on public relays.** The
  mechanics work and the publisher carries the legal exposure. Keep these inside
  a governed process with evidence and appeals.
- **Blanket "taint" scores for coins or addresses, and scoring people at
  scale.** An anonymous panel with no appeal is the wrong instrument for either.
- **Agent-only circles.** Keys are free.
- **Truth.** A threshold of anonymous members agreeing is not evidence that the
  claim is true.
- **Cases where a named attestation is worth more.** Key succession, and most
  endorsements where the endorser's reputation is the point.

## Index by sector

| Sector | Where to look |
| --- | --- |
| Nostr clients, relays and communities | P1 (clients, DVMs, communities, wiki entries, proposals), P3, P9 (relay write passes), P12 |
| Bitcoin, Lightning and ecash | P1 (mints, service providers, exchanges), P3 (redemption failures, scam payees), P8 (street rates), P13 (oracles) |
| Software supply chain and security | P1 (agent tools, digests, rebuilds, vulnerabilities), P3 (threat intelligence, pause calls), P7 (sign-off, advisories) |
| AI agents | The AI agent atlas page, P1 (agent tools), P13 |
| Journalism and civic work | P6 (leaks, two sources), P7 (field confirmations), P8 (vote tabulation, incident counts), P3 (censorship sightings), P11 (canaries) |
| Workplaces and unions | P1 (employers, peer review), P3 (misconduct, near-miss), P4 and P7 (polls, petitions), P6 (staff questions), P8 (pay, morale) |
| Education and research | P1 (courses, papers, marking), P6 (referee reports), P8 (Delphi panels) |
| Markets and gig work | P1 (listings, clients, counterparties), P2 (seller onboarding), P4 (dispute juries), P7 (milestones) |
| Governance | P4, P5, P10, P11 |
| Access and identity | P2, P9 |
| Health | P1 (clinician peer rating), and the roadmap |

## Appendix: what was run

Everything ran on 2026-11-23 in a clean checkout of nostr-veil 0.34.1 with the
locked dependencies (`@forgesworn/ring-sig` 3.0.4, `@noble/curves` 2.4.0), on
Node 24.14.0 and an Apple M4 Max. The scripts were throwaway and are not in the
repository, so each line says enough to repeat it.

- **Size and time (limit 3).** For each ring size, random keys, then K
  contributions with `contributeIdentifierAssertion` and one `rank` metric,
  aggregated, signed and verified with `verifyProof`. Size is the byte length of
  the signed event as JSON. One `lsagVerify` on a ring of 100 took 441 ms, and
  `verifyProof` on the same single signature took 437 ms.
- **`min`, `max` and `sum`.** Three ballots `[1, 1, 0]` on an event subject gave
  0, 1 and 2. All three passed `verifyProof` and `validateAssertionStrict`.
- **Period in the subject.** One member contributing twice to
  `pulse:team.example:2026-W47` produced the same key image, and aggregation
  threw `Duplicate key image detected`. The same member on
  `pulse:team.example:2026-W48` produced a different key image.
- **Custom metric.** `day_rate_pence` on kind 30385 passed `verifyProof` and
  loose `validateAssertion`, and failed strict validation with
  `Unknown metric tag "day_rate_pence" for kind 30385.`
- **Key holder (limit 6).** `computeKeyImage(privateKey, publicKey, electionId)`
  matched a signer's `veil-sig` key image. A non-signer's computed key image was
  not in the event.
- **Omission (limit 5).** As described under the limit. The dropped
  contributor's key image was absent from the censored event.
- **Ballot range (limit 4).** As described under the limit, including
  `verifyDeploymentPolicy` with `metricPolicies` of `rank` 0 to 5 on the
  anonymous group decisions profile. With one outlier of 100 among three zeros
  and a one, `mean` gave 20 and `median` gave 0.
- **NIP-73 typed identifiers (limit 9).** Subjects `doi:10.1000/182` with `k`
  of `doi`, a `geo` geohash, a `web` URL and a `bitcoin:address`, each scored by
  three members. All passed `validateAssertionStrict`, `verifyProof` and
  `verifyUseCaseProfile`. `validateUseCaseProfileDefinition` returned
  `profile.kind 30385 must define a decimal subjectTagValue namespace` for each.
- **Shared scope (P10).** Two events from one scoped circle with disjoint
  signers, signed by different publishers, passed `verifyFederation` with 5
  distinct signers. A third event overlapping both still gave 5 distinct of 7
  signatures. An old roster and a roster with one new member under the same
  scope, with one member signing in both, gave 5 distinct of 6. Four one-signer
  events gave 4 distinct. Without a scope `verifyFederation` rejected them.
- **One signer (P6).** A one-of-eight event assertion verified with a threshold
  of 1.
- **Bearer (limit 11).** The tags of a verified event, signed again by an
  unrelated key, passed `verifyProof` and `verifySignedEvent`.
- **Subject in its own ring.** Two members scoring a third gave
  `subjectInRing: true`, 2 distinct signers and 1 independent signer. The
  subject's own attempt threw.
- **Custom aggregate.** A trimmed mean verified only when the same function was
  passed to `verifyProof`.

The size and time table, and every check above it in this list, ran with the
locked dependencies. The ballot-range policy check and the NIP-73 identifiers
ran in a checkout with older installed dependencies (`ring-sig` 2.0.0), which
does not affect validation or policy logic.

Not run: anything under P12, the lottery idea in P9, weight classes in P4, and
any measurement on a phone or in a browser.
