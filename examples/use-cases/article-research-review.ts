import {
  NIP85_KINDS,
  aggregateAddressableContributions,
  contributeAddressableAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  authorPubkey,
  defaultMembers,
  memberIndex,
  proofVersion,
  verifyUseCaseAssertion,
  withCreatedAt,
} from './_shared.js'

const slug = 'article-research-review'
const articleAddress = `30023:${authorPubkey}:paper-2026-05`
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeAddressableAssertion(
    circle,
    articleAddress,
    {
      rank: 82 + index * 2,
      comment_cnt: index + 1,
    },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateAddressableContributions(
  circle,
  articleAddress,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.ADDRESSABLE,
  subject: articleAddress,
  subjectTag: 'a',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
