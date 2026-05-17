import {
  NIP85_KINDS,
  aggregateContributions,
  contributeAssertion,
  createTrustCircle,
} from 'nostr-veil'
import {
  keys,
  memberIndex,
  proofVersion,
  subjectPubkey,
  verifyFederatedUseCase,
  withCreatedAt,
} from './_shared.js'
import type { TrustCircle } from 'nostr-veil'

const slug = 'federated-moderation'
const scope = 'moderation.federation.example'
const circleA = createTrustCircle(keys.slice(0, 3).map(member => member.pub), { scope })
const circleB = createTrustCircle(keys.slice(1, 4).map(member => member.pub), { scope })

function makeAssertion(circle: TrustCircle, members: typeof keys, offset: number) {
  const contributions = members.map((member, index) =>
    contributeAssertion(
      circle,
      subjectPubkey,
      {
        rank: offset + index * 5,
        reports_cnt_recd: index + 1,
      },
      member.priv,
      memberIndex(circle, member.pub),
      { proofVersion },
    ),
  )

  return withCreatedAt(aggregateContributions(
    circle,
    subjectPubkey,
    contributions,
    { proofVersion },
  ))
}

export const events = [
  makeAssertion(circleA, keys.slice(0, 3), 30),
  makeAssertion(circleB, keys.slice(1, 4), 35),
]

export const result = verifyFederatedUseCase(slug, events, {
  kind: NIP85_KINDS.USER,
  subject: subjectPubkey,
  scope,
  minDistinctSigners: 4,
})
