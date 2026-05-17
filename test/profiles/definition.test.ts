import { describe, expect, it } from 'vitest'
import {
  NIP85_KINDS,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  USE_CASE_PROFILES,
  validateUseCaseProfileDefinition,
} from '../../src/index.js'
import type { UseCaseProfile } from '../../src/index.js'

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
    expect(result.errors).toContain('profile.kind 30385 must define a decimal subjectTagValue namespace')
    expect(result.errors).toContain('profile.subjectFormats[0] "pubkey" is not compatible with kind 30385')
    expect(result.errors).toContain('profile.metrics[0].name "zap_amount" is not valid for kind 30385')
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
