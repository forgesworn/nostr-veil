import { describe, expect, it } from 'vitest'
import {
  VERIFICATION_ISSUE_EXPLANATIONS,
  classifyVerificationError,
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

  it('classifies an aggregate mismatch and an out-of-bounds contribution', () => {
    expect(classifyVerificationError('event[0] proof: veil-agg is "max" but "median" is required'))
      .toMatchObject({ code: 'proof.aggregate_mismatch', path: 'event[0]' })

    for (const message of [
      'event[0] proof: Signature at index 2 metric "rank" value 3 is above the contribution maximum 1',
      'event[0] proof: Signature at index 1 metric "rank" value -2 is below the contribution minimum 0',
      'event[1] proof: Signature at index 1 metric "rank" value 0.5 is not an integer, as the contribution bounds require',
      'event[0] proof: Signature at index 2 metric "rank" is missing, as the contribution bounds require',
    ]) {
      expect(classifyVerificationError(message).code, message).toBe('proof.contribution_out_of_bounds')
    }

    expect(explainVerificationIssue('proof.aggregate_mismatch').remediation).toContain('aggregate')
    expect(explainVerificationIssue('proof.contribution_out_of_bounds').action).toBe('reject')
  })

  it('keeps remediation lookup entries immutable', () => {
    expect(Object.isFrozen(VERIFICATION_ISSUE_EXPLANATIONS)).toBe(true)
    expect(Object.isFrozen(VERIFICATION_ISSUE_EXPLANATIONS['proof.invalid'])).toBe(true)
  })
})
