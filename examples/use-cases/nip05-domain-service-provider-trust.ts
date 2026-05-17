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

const slug = 'nip05-domain-service-provider-trust'
const domainId = 'nip05:alice@example.com'
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeIdentifierAssertion(
    circle,
    domainId,
    externalProfileKind,
    { rank: 80 + index * 2 },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateIdentifierContributions(
  circle,
  domainId,
  externalProfileKind,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.IDENTIFIER,
  subject: domainId,
  subjectTag: 'k',
  subjectTagValue: externalProfileKind,
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
