import {
  NIP85_KINDS,
  aggregateIdentifierContributions,
  contributeIdentifierAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  defaultMembers,
  externalProfileKind,
  memberIndex,
  proofVersion,
  verifyUseCaseAssertion,
  withCreatedAt,
} from './_shared.js'

const slug = 'vendor-marketplace-signals'
const vendorId = 'vendor:market.example:alice'
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((counterparty, index) =>
  contributeIdentifierAssertion(
    circle,
    vendorId,
    externalProfileKind,
    {
      rank: 62 + index * 4,
      reaction_cnt: index + 1,
    },
    counterparty.priv,
    memberIndex(circle, counterparty.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateIdentifierContributions(
  circle,
  vendorId,
  externalProfileKind,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.IDENTIFIER,
  subject: vendorId,
  subjectTag: 'k',
  subjectTagValue: externalProfileKind,
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
