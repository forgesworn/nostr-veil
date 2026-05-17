# Federated moderation

Use this when several trust circles assess the same subject and the verifier
needs to count distinct contributors across circles without double-counting
members who appear in more than one circle.

## Fit

- Status: supported today.
- NIP-85 kind: any supported assertion kind, as long as all events agree on the
  same subject and `scope`.
- Subject: usually a user pubkey or event id.
- Helpers: `createTrustCircle(members, { scope })`, aggregate normally, then
  `verifyFederation`.
- Scope format: lowercase slug using letters, digits, dot, hyphen, or
  underscore.
- Proof version: v2 recommended.

## Worked example

```ts
import {
  aggregateContributions,
  contributeAssertion,
  createTrustCircle,
  verifyFederation,
} from 'nostr-veil'

const proofVersion = 'v2' as const
const scope = 'moderation.federation.example'
const subjectPubkey = reportedUserPubkey

const circleA = createTrustCircle(groupA.map(m => m.pubkey), { scope })
const circleB = createTrustCircle(groupB.map(m => m.pubkey), { scope })

function makeEvent(circle, members) {
  const contributions = members.map((member) =>
    contributeAssertion(
      circle,
      subjectPubkey,
      { rank: member.trustRank, reports_cnt_recd: member.reportCount },
      member.privateKey,
      circle.members.indexOf(member.pubkey),
      { proofVersion },
    ),
  )

  return aggregateContributions(circle, subjectPubkey, contributions, { proofVersion })
}

const eventA = makeEvent(circleA, groupA)
const eventB = makeEvent(circleB, groupB)
const federation = verifyFederation([eventA, eventB])

if (!federation.valid) throw new Error(federation.errors.join('; '))
console.log(federation.distinctSigners, federation.totalSignatures)
```

## What this proves

- Each event independently verifies.
- All events agree on subject and scope.
- Matching scoped key images are counted once across circles.
- A member who contributed in multiple circles does not inflate the total.

## What not to claim

- It does not hide that the same unknown contributor appeared in more than one
  circle.
- It does not prove the circles are independent.
- It does not deduplicate unscoped events.

## Policy choices

- Is revealing cross-circle overlap acceptable for this federation?
- Which communities are allowed to share the scope?
- Does the federation require every circle to meet its own threshold first?
- How should clients display disagreement between circles?
