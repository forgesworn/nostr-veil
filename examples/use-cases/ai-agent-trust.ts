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

const slug = 'ai-agent-trust'
// The circle is human-curated: an operator's maintainers vouch for the agent key.
const agentPubkey = subjectPubkey
const circle = createTrustCircle(defaultMembers.map(member => member.pub))

const contributions = defaultMembers.map((member, index) =>
  contributeAssertion(
    circle,
    agentPubkey,
    { rank: 85 + index },
    member.priv,
    memberIndex(circle, member.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateContributions(
  circle,
  agentPubkey,
  contributions,
  { proofVersion },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.USER,
  subject: agentPubkey,
  subjectTag: 'p',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
})
