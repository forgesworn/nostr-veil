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

const slug = 'release-package-maintainer-reputation'
const packageId = 'npm:nostr-veil@0.14.0'
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeIdentifierAssertion(
    circle,
    packageId,
    externalProfileKind,
    { rank: 86 + index },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateIdentifierContributions(
  circle,
  packageId,
  externalProfileKind,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.IDENTIFIER,
  subject: packageId,
  subjectTag: 'k',
  subjectTagValue: externalProfileKind,
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
