import {
  NIP85_KINDS,
  aggregateContributions,
  contributeAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  defaultMembers,
  memberIndex,
  proofVersion,
  subjectPubkey,
  verifyUseCaseAssertion,
  withCreatedAt,
} from './_shared.js'

const slug = 'user-reputation-abuse-reporting'
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeAssertion(
    circle,
    subjectPubkey,
    {
      rank: 24 + index * 3,
      reports_cnt_recd: index + 1,
    },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateContributions(
  circle,
  subjectPubkey,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.USER,
  subject: subjectPubkey,
  subjectTag: 'p',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
