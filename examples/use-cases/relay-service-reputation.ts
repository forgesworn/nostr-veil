import {
  NIP85_KINDS,
  aggregateIdentifierContributions,
  contributeIdentifierAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  defaultMembers,
  memberIndex,
  proofVersion,
  verifyUseCaseAssertion,
  withCreatedAt,
} from './_shared.js'

const slug = 'relay-service-reputation'
const relayProfileKind = '10002'
const relayId = 'relay:wss://relay.example.com'
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeIdentifierAssertion(
    circle,
    relayId,
    relayProfileKind,
    {
      rank: 74 + index * 3,
      reaction_cnt: index + 1,
    },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateIdentifierContributions(
  circle,
  relayId,
  relayProfileKind,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.IDENTIFIER,
  subject: relayId,
  subjectTag: 'k',
  subjectTagValue: relayProfileKind,
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
