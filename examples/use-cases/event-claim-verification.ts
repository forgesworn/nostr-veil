import {
  NIP85_KINDS,
  aggregateEventContributions,
  contributeEventAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  defaultMembers,
  memberIndex,
  proofVersion,
  verifyUseCaseAssertion,
  withCreatedAt,
} from './_shared.js'

const slug = 'event-claim-verification'
const claimEventId = 'aa'.repeat(32)
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((checker, index) =>
  contributeEventAssertion(
    circle,
    claimEventId,
    {
      rank: 70 + index * 4,
      reaction_cnt: index + 1,
    },
    checker.priv,
    memberIndex(circle, checker.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateEventContributions(
  circle,
  claimEventId,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.EVENT,
  subject: claimEventId,
  subjectTag: 'e',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
