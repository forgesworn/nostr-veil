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

const slug = 'anonymous-group-decisions'

// A motion put to a known three-member committee. Its event id is the subject
// every ballot is bound to. Each member casts one ballot: { rank: 1 } for aye,
// { rank: 0 } against. Summing the rank metric yields the count of ayes — an
// anonymous, verifiable tally where the key image keeps it to one ballot each
// and no party can link a ballot to its signer. A key image does not stop a
// ballot worth more than one, so the aggregator and the verifier both bound
// each ballot to 0 or 1, and the verifier requires the sum aggregate. The
// summed rank is bounded 0-100, so this suits small committees; petitions count
// distinct signers instead.
const motionEventId = 'cd'.repeat(32)
const circle = createTrustCircle(defaultMembers.map(member => member.pub))
const ballotBounds = { rank: { min: 0, max: 1, integer: true } }

const ballots = [1, 1, 0] // two ayes, one against — full turnout of the committee
const contributions = defaultMembers.map((member, index) =>
  contributeEventAssertion(
    circle,
    motionEventId,
    { rank: ballots[index] },
    member.priv,
    memberIndex(circle, member.pub),
    { proofVersion },
  ),
)

export const assertion = withCreatedAt(aggregateEventContributions(
  circle,
  motionEventId,
  contributions,
  { proofVersion, aggregate: 'sum', contributionBounds: ballotBounds },
))

export const result = verifyUseCaseAssertion(slug, assertion, {
  kind: NIP85_KINDS.EVENT,
  subject: motionEventId,
  subjectTag: 'e',
  circleId: circle.circleId,
  minDistinctSigners: 3,
  freshAfter: assertion.created_at - 300,
  requireAggregate: 'sum',
  contributionBounds: ballotBounds,
})
