import { describe, expect, it } from 'vitest'
import {
  VERIFICATION_ISSUE_EXPLANATIONS,
  explainVerificationIssue,
  remediationForIssue,
} from '../../src/index.js'

describe('verification issue explanations', () => {
  it('explains missing trust anchors with an operator remediation', () => {
    const explanation = explainVerificationIssue('bundle.trusted_publishers_missing')

    expect(explanation).toEqual({
      code: 'bundle.trusted_publishers_missing',
      summary: 'No trusted bundle publisher keys were configured.',
      remediation: 'Pass trustedPublishers to the verifier and pin the operator keys your deployment actually trusts.',
      action: 'operator-action',
    })
  })

  it('accepts issue objects as well as issue codes', () => {
    const remediation = remediationForIssue({
      code: 'event.signature_invalid',
      message: 'event[0] Nostr event signature is invalid',
      path: 'event[0]',
    })

    expect(remediation).toContain('Reject the event')
  })

  it('keeps remediation lookup entries immutable', () => {
    expect(Object.isFrozen(VERIFICATION_ISSUE_EXPLANATIONS)).toBe(true)
    expect(Object.isFrozen(VERIFICATION_ISSUE_EXPLANATIONS['proof.invalid'])).toBe(true)
  })
})
