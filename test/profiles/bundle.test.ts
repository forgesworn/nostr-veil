import { describe, expect, it } from 'vitest'
import { assertion as packageAssertion } from '../../examples/use-cases/release-package-maintainer-reputation.js'
import {
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  signEvent,
  verifyDeploymentBundle,
} from '../../src/index.js'
import type { EventTemplate, SignedDeploymentBundle } from '../../src/index.js'

const BUNDLE_PUBLISHER_KEY = '44'.repeat(32)
const RELAY_PUBLISHER_KEY = '55'.repeat(32)

function ring(event: EventTemplate): string[] {
  const members = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (members === undefined) throw new Error('missing veil-ring tag')
  return members
}

function tagValue(event: EventTemplate, name: string): string {
  const value = event.tags.find(tag => tag[0] === name)?.[1]
  if (value === undefined) throw new Error(`missing ${name} tag`)
  return value
}

function bundle(): SignedDeploymentBundle {
  const manifest = createCircleManifest({
    issuedAt: packageAssertion.created_at ?? 0,
    expiresAt: (packageAssertion.created_at ?? 0) + 900,
    members: ring(packageAssertion),
    name: 'Package reviewers',
    profileIds: [RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id],
    purpose: 'Release safety review',
  })
  const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
    circleManifests: [manifest],
    expectedSubject: tagValue(packageAssertion, 'd'),
    metricPolicies: {
      rank: { required: true, min: 80, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })

  return createSignedDeploymentBundle(policy, {
    expiresAt: (packageAssertion.created_at ?? 0) + 600,
    id: 'package-release-gate',
    issuedAt: packageAssertion.created_at ?? 0,
    privateKey: BUNDLE_PUBLISHER_KEY,
  })
}

describe('signed deployment bundles', () => {
  it('verifies the bundle publisher, deployment policy, and signed assertion together', () => {
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const signedBundle = bundle()
    const result = verifyDeploymentBundle(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
      trustedPublishers: [signedBundle.signer],
    })

    expect(result.valid, result.errors.join('; ')).toBe(true)
    expect(result.bundle.signatureValid).toBe(true)
    expect(result.bundle.publisherTrusted).toBe(true)
    expect(result.deployment.valid).toBe(true)
  })

  it('rejects a tampered policy even when the assertion still passes the original policy', () => {
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const signedBundle = bundle()
    const tampered: SignedDeploymentBundle = {
      ...signedBundle,
      policy: {
        ...signedBundle.policy,
        metricPolicies: {
          ...signedBundle.policy.metricPolicies,
          rank: { ...signedBundle.policy.metricPolicies.rank, min: 90 },
        },
      },
    }
    const result = verifyDeploymentBundle(signedAssertion, tampered, {
      now: packageAssertion.created_at,
      trustedPublishers: [signedBundle.signer],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.join('; ')).toContain('bundle signature is invalid')
  })

  it('rejects untrusted, expired, and unsigned deployment authority', () => {
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const signedBundle = bundle()

    const untrusted = verifyDeploymentBundle(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
      trustedPublishers: ['f'.repeat(64)],
    })
    const expired = verifyDeploymentBundle(signedAssertion, signedBundle, {
      now: (signedBundle.expiresAt ?? 0) + 1,
      trustedPublishers: [signedBundle.signer],
    })
    const noTrustAnchor = verifyDeploymentBundle(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
    })

    expect(untrusted.valid).toBe(false)
    expect(untrusted.errors.join('; ')).toContain('bundle signer is not trusted')
    expect(expired.valid).toBe(false)
    expect(expired.errors.join('; ')).toContain('bundle is expired')
    expect(noTrustAnchor.valid).toBe(false)
    expect(noTrustAnchor.errors.join('; ')).toContain('no trusted bundle publishers configured')
  })
})
