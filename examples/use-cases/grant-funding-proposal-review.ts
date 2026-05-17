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

const slug = 'grant-funding-proposal-review'
const proposalAddress = `30023:${authorPubkey}:grant-2026-q2`
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeAddressableAssertion(
    circle,
    proposalAddress,
    { rank: 68 + index * 5 },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateAddressableContributions(
  circle,
  proposalAddress,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.ADDRESSABLE,
  subject: proposalAddress,
  subjectTag: 'a',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
