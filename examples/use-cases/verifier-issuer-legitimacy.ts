import {
  NIP85_KINDS,
  aggregateIdentifierContributions,
  canonicalVerifierSubject,
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

const slug = 'verifier-issuer-legitimacy'
const verifierSubject = canonicalVerifierSubject(
  'proof-of-person',
  'in-person',
  'aa'.repeat(32),
)
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((reviewer, index) =>
  contributeIdentifierAssertion(
    circle,
    verifierSubject,
    externalProfileKind,
    {
      rank: 82 + index * 3,
      reaction_cnt: index + 2,
    },
    reviewer.priv,
    memberIndex(circle, reviewer.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateIdentifierContributions(
  circle,
  verifierSubject,
  externalProfileKind,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.IDENTIFIER,
  subject: verifierSubject,
  subjectTag: 'k',
  subjectTagValue: externalProfileKind,
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
