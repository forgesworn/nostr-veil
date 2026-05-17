import { describe, expect, it } from 'vitest'
import { assertion as packageAssertion } from '../../examples/use-cases/release-package-maintainer-reputation.js'
import {
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  signEvent,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { EventTemplate, SignedDeploymentBundle, UseCaseDeploymentPolicy } from '../../src/index.js'

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

function policy(options: { requireNostrSignature?: boolean } = {}): UseCaseDeploymentPolicy {
  const manifest = createCircleManifest({
    issuedAt: packageAssertion.created_at ?? 0,
    expiresAt: (packageAssertion.created_at ?? 0) + 900,
    members: ring(packageAssertion),
    name: 'Package reviewers',
    profileIds: [RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id],
    purpose: 'Release safety review',
  })

  return createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
    circleManifests: [manifest],
    expectedSubject: tagValue(packageAssertion, 'd'),
    metricPolicies: {
      rank: { required: true, min: 80, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: options.requireNostrSignature ?? true,
  })
}

function bundle(
  deploymentPolicy = policy(),
  options: { expiresAt?: number } = { expiresAt: (packageAssertion.created_at ?? 0) + 600 },
): SignedDeploymentBundle {
  return createSignedDeploymentBundle(deploymentPolicy, {
    ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
    id: 'package-release-gate',
    issuedAt: packageAssertion.created_at ?? 0,
    privateKey: BUNDLE_PUBLISHER_KEY,
  })
}

function issueCodes(result: { issues: ReadonlyArray<{ code: string }> }): string[] {
  return result.issues.map(issue => issue.code)
}

describe('production deployment verifier', () => {
  it('accepts a signed assertion through a trusted signed bundle in one call', () => {
    const signedBundle = bundle()
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const result = verifyProductionDeployment(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
      trustedPublishers: [signedBundle.signer],
    })

    expect(result.valid, result.errors.join('; ')).toBe(true)
    expect(result.decision).toBe('accept')
    expect(result.issues).toEqual([])
    expect(result.deployment.metrics.rank).toEqual([87])
  })

  it('returns stable issue codes for missing trust anchors', () => {
    const signedBundle = bundle()
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const result = verifyProductionDeployment(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
    })

    expect(result.valid).toBe(false)
    expect(result.decision).toBe('reject')
    expect(issueCodes(result)).toContain('bundle.trusted_publishers_missing')
  })

  it('rejects production bundles that do not expire by default', () => {
    const signedBundle = bundle(policy(), { expiresAt: undefined })
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const result = verifyProductionDeployment(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
      trustedPublishers: [signedBundle.signer],
    })

    expect(result.valid).toBe(false)
    expect(issueCodes(result)).toContain('bundle.expiry_required')

    const explicitlyAllowed = verifyProductionDeployment(signedAssertion, signedBundle, {
      now: packageAssertion.created_at,
      requireBundleExpiry: false,
      trustedPublishers: [signedBundle.signer],
    })
    expect(explicitlyAllowed.valid, explicitlyAllowed.errors.join('; ')).toBe(true)
  })

  it('rejects bundles whose policy would allow unsigned relay events', () => {
    const signedBundle = bundle(policy({ requireNostrSignature: false }))
    const result = verifyProductionDeployment(packageAssertion, signedBundle, {
      now: packageAssertion.created_at,
      trustedPublishers: [signedBundle.signer],
    })

    expect(result.valid).toBe(false)
    expect(issueCodes(result)).toContain('policy.nostr_signature_not_required')
  })

  it('reports signed relay event mutation with a machine-readable code', () => {
    const signedBundle = bundle()
    const signedAssertion = signEvent(packageAssertion, RELAY_PUBLISHER_KEY)
    const tampered = {
      ...signedAssertion,
      content: `${signedAssertion.content}tampered`,
    }
    const result = verifyProductionDeployment(tampered, signedBundle, {
      now: packageAssertion.created_at,
      trustedPublishers: [signedBundle.signer],
    })

    expect(result.valid).toBe(false)
    expect(issueCodes(result)).toContain('event.signature_invalid')
  })
})
