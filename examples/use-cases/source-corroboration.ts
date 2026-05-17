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

const slug = 'source-corroboration'
const sourceId = 'source:newsroom-a:case-2026-05'
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((member, index) =>
  contributeIdentifierAssertion(
    circle,
    sourceId,
    externalProfileKind,
    { rank: 78 + index * 2 },
    member.priv,
    memberIndex(circle, member.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateIdentifierContributions(
  circle,
  sourceId,
  externalProfileKind,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.IDENTIFIER,
  subject: sourceId,
  subjectTag: 'k',
  subjectTagValue: externalProfileKind,
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
