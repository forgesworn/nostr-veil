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

const slug = 'relay-community-admission'
const applicantPubkey = subjectPubkey
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((member, index) =>
  contributeAssertion(
    circle,
    applicantPubkey,
    { rank: 91 + index },
    member.priv,
    memberIndex(circle, member.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateContributions(
  circle,
  applicantPubkey,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.USER,
  subject: applicantPubkey,
  subjectTag: 'p',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
