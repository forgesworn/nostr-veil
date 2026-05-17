import {
  NIP85_KINDS,
  aggregateEventContributions,
  contributeEventAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  defaultMembers,
  memberIndex,
  proofVersion,
  verifyUseCaseAssertion,
  withCreatedAt,
} from './_shared.js'

const slug = 'anonymous-credential-attestation-cosigning'
const attestationEventId = 'cc'.repeat(32)
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((attestor, index) =>
  contributeEventAssertion(
    circle,
    attestationEventId,
    { rank: 90 + index },
    attestor.priv,
    memberIndex(circle, attestor.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateEventContributions(
  circle,
  attestationEventId,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.EVENT,
  subject: attestationEventId,
  subjectTag: 'e',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
