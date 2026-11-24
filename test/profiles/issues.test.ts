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

  it('classifies a publisher the policy does not accept and a malformed publisher list', () => {
    expect(classifyVerificationError('event[1] publisher is not accepted by deployment policy'))
      .toMatchObject({ code: 'event.publisher_unaccepted', path: 'event[1]' })
    expect(classifyVerificationError('acceptedPublishers[2] must be a 64-character lowercase hex string'))
      .toMatchObject({ code: 'policy.accepted_publishers_invalid', path: 'acceptedPublishers[2]' })
    expect(classifyVerificationError('acceptedPublishers must be a list of at least one publisher key').code)
      .toBe('policy.accepted_publishers_invalid')

    // The bundle's own publisher list keeps its separate codes
    expect(classifyVerificationError('trustedPublishers[0] must be a 64-character lowercase hex string').code)
      .toBe('bundle.trusted_publisher_invalid')
    expect(classifyVerificationError('event[0] circle is not accepted by deployment policy').code)
      .toBe('circle.unaccepted')

    expect(explainVerificationIssue('event.publisher_unaccepted').action).toBe('reject')
    expect(explainVerificationIssue('event.publisher_unaccepted').remediation).toContain('acceptedPublishers')
    expect(explainVerificationIssue('policy.accepted_publishers_invalid').action).toBe('operator-action')
  })

  // The syntax, proof and metric messages quote tag names taken from the event,
  // so an event must not be able to name its way into a publisher code
  it('reads a publisher code only from a message the publisher check writes', () => {
    expect(classifyVerificationError('event[0] syntax: Unknown metric tag "acceptedPublishers" for kind 30382.').code)
      .toBe('nip85.syntax_invalid')
    expect(classifyVerificationError('event[0] proof: Published metric "acceptedPublishers" is not signed by any contribution').code)
      .toBe('proof.invalid')
    expect(classifyVerificationError('event[0] metric "acceptedPublishers" is not allowed by deployment policy'))
      .toMatchObject({ code: 'metric.unknown', path: 'event[0].tags.acceptedPublishers' })
    expect(classifyVerificationError('event[0] metric "my publisher is not accepted" is not allowed by deployment policy').code)
      .toBe('metric.unknown')
    expect(classifyVerificationError('event[0] syntax: Unknown metric tag "acceptedPublishers[0] must be" for kind 30382.'))
      .toMatchObject({ code: 'nip85.syntax_invalid', path: 'event[0]' })
  })

  it('keeps remediation lookup entries immutable', () => {
    expect(Object.isFrozen(VERIFICATION_ISSUE_EXPLANATIONS)).toBe(true)
    expect(Object.isFrozen(VERIFICATION_ISSUE_EXPLANATIONS['proof.invalid'])).toBe(true)
  })
})
