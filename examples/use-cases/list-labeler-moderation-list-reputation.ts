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

const slug = 'list-labeler-moderation-list-reputation'
const listAddress = `30000:${authorPubkey}:trusted-relays`
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((curator, index) =>
  contributeAddressableAssertion(
    circle,
    listAddress,
    {
      rank: 76 + index * 3,
      reaction_cnt: index + 1,
    },
    curator.priv,
    memberIndex(circle, curator.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateAddressableContributions(
  circle,
  listAddress,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.ADDRESSABLE,
  subject: listAddress,
  subjectTag: 'a',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
