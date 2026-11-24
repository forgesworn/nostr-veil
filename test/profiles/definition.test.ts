import { describe, expect, it } from 'vitest'
import {
  NIP85_KINDS,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  USE_CASE_PROFILES,
  validateUseCaseProfileDefinition,
} from '../../src/index.js'
import type { UseCaseProfile } from '../../src/index.js'

const K_TAG_ERROR = 'profile.kind 30385 must define a subjectTagValue: a NIP-73 type or a decimal namespace, 1 to 64 printable ASCII characters without spaces'

function packageProfile(overrides: Partial<UseCaseProfile> = {}): UseCaseProfile {
  return {
    ...RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
    ...overrides,
  }
}

describe('validateUseCaseProfileDefinition', () => {
  it('accepts every built-in use-case profile without safety warnings', () => {
    for (const profile of USE_CASE_PROFILES) {
      const result = validateUseCaseProfileDefinition(profile)

      expect(result.valid, `${profile.id}: ${result.errors.join('; ')}`).toBe(true)
      expect(result.warnings, profile.id).toEqual([])
    }
  })

  it.each(['expiration', 'alt'])('rejects a metric named after the publisher tag %s', name => {
    const result = validateUseCaseProfileDefinition(packageProfile({
      kind: 39000,
      metrics: [{ name, meaning: 'Publisher tag, not a metric.', direction: 'count' }],
    }))

    expect(result.errors).toContain('profile.metrics[0].name must not be a publisher tag (expiration or alt)')
  })

  it('rejects profile definitions that cannot verify the claimed NIP-85 route', () => {
    const result = validateUseCaseProfileDefinition(packageProfile({
      kind: NIP85_KINDS.IDENTIFIER,
      subjectTag: 'p',
      subjectTagValue: undefined,
      subjectFormats: ['pubkey'],
      metrics: [
        {
          name: 'zap_amount',
          meaning: 'Unsupported identifier metric.',
          direction: 'count',
        },
      ],
    }))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('profile.kind 30385 must use subjectTag k')
    expect(result.errors).toContain(K_TAG_ERROR)
    expect(result.errors).toContain('profile.subjectFormats[0] "pubkey" is not compatible with kind 30385')
    expect(result.errors).toContain('profile.metrics[0].name "zap_amount" is not valid for kind 30385')
  })

  it('accepts a NIP-73 type or a decimal namespace as an identifier profile k value', () => {
    for (const subjectTagValue of ['doi', 'geo', 'web', 'podcast:guid', 'bitcoin:address', '0', '10002']) {
      const result = validateUseCaseProfileDefinition(packageProfile({
        subjectFormats: ['identifier'],
        subjectTagValue,
      }))

      expect(result.errors, subjectTagValue).toEqual([])
    }
  })

  it('rejects an identifier profile k value that could not be a k tag', () => {
    for (const subjectTagValue of ['', 'has space', 'tab\there', 'x'.repeat(65)]) {
      const result = validateUseCaseProfileDefinition(packageProfile({ subjectTagValue }))

      expect(result.errors, JSON.stringify(subjectTagValue)).toContain(K_TAG_ERROR)
    }
  })

  it('checks the aggregate a profile pins, and warns when none is pinned', () => {
    const invalid = validateUseCaseProfileDefinition(packageProfile({ aggregate: 'mode' as never }))
    expect(invalid.errors).toContain('profile.aggregate must be one of median, mean, sum, min, max or custom')

    const unpinned = validateUseCaseProfileDefinition(packageProfile({ aggregate: undefined }))
    expect(unpinned.valid).toBe(true)
    expect(unpinned.warnings.join('; ')).toContain('profile.aggregate is not set')
  })

  it('checks contribution bounds, and asks for them when one contribution can move the result', () => {
    const ballot = { name: 'rank', meaning: 'Count of ayes.', direction: 'count' as const }

    const unbounded = validateUseCaseProfileDefinition(packageProfile({ aggregate: 'sum', metrics: [ballot] }))
    expect(unbounded.warnings.join('; ')).toContain('profile.metrics[0] has no contribution bounds')

    const bounded = validateUseCaseProfileDefinition(packageProfile({
      aggregate: 'sum',
      metrics: [{ ...ballot, contribution: { min: 0, max: 1, integer: true } }],
    }))
    expect(bounded.valid).toBe(true)
    expect(bounded.warnings.join('; ')).not.toContain('contribution bounds')

    const malformed = validateUseCaseProfileDefinition(packageProfile({
      metrics: [{ ...ballot, contribution: { min: 2, max: 1 } }],
    }))
    expect(malformed.errors).toContain('profile.metrics[0].contribution.min must be <= max')
  })

  it('warns when a supported profile overclaims or omits real-world controls', () => {
    const result = validateUseCaseProfileDefinition(packageProfile({
      proofClaims: [
        'The proof proves the package is safe and malware-free.',
      ],
      proofLimitations: [
        'The deployment still decides how to act.',
      ],
      requiredControls: [
        {
          risk: 'Operators may rely on the score alone.',
          control: 'Set a threshold and log the result.',
        },
      ],
    }))

    expect(result.valid).toBe(true)
    expect(result.warnings.join('; ')).toContain('appears to claim a real-world conclusion')
    expect(result.warnings.join('; ')).toContain('supply-chain controls')
  })
})
