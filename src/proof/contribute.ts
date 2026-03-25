import { lsagSign } from '@forgesworn/ring-sig'
import { createAttestation } from 'nostr-attestations'
import type { TrustCircle, Contribution } from './types.js'
import { canonicalMessage } from './circle.js'

export function contributeAssertion(
  circle: TrustCircle,
  subject: string,
  metrics: Record<string, number>,
  privateKey: string,
  memberIndex: number
): Contribution {
  const message = canonicalMessage(circle.circleId, subject, metrics)
  const electionId = `veil:${circle.circleId}:${subject}`

  const signature = lsagSign(message, circle.members, memberIndex, privateKey, electionId)

  const attestation = createAttestation({
    type: 'vouch',
    identifier: subject,
    subject,
    content: JSON.stringify(metrics),
  })

  return {
    attestation,
    signature,
    keyImage: signature.keyImage,
    metrics,
  }
}
