import { describe, expect, it } from 'vitest'
import { assertion as packageAssertion } from '../../examples/use-cases/release-package-maintainer-reputation.js'
import {
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  computeCircleId,
  createCircleManifest,
  createDeploymentPolicy,
  verifyCircleManifest,
  verifyDeploymentPolicy,
} from '../../src/index.js'
import type { CircleManifest, EventTemplate } from '../../src/index.js'

function ring(event: EventTemplate): string[] {
  const members = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (members === undefined) throw new Error('missing veil-ring')
  return members
}

function tagValue(event: EventTemplate, name: string): string {
  const value = event.tags.find(tag => tag[0] === name)?.[1]
  if (value === undefined) throw new Error(`missing ${name}`)
  return value
}

function manifest(overrides: Partial<CircleManifest> = {}): CircleManifest {
  return {
    ...createCircleManifest({
      issuedAt: packageAssertion.created_at ?? 0,
      expiresAt: (packageAssertion.created_at ?? 0) + 600,
      members: ring(packageAssertion),
      name: 'Package reviewers',
      profileIds: [RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id],
      purpose: 'Review package releases',
    }),
    ...overrides,
  }
}

describe('circle manifests', () => {
  it('creates a canonical manifest from ring members', () => {
    const created = manifest()

    expect(created.version).toBe(1)
    expect(created.members).toEqual([...ring(packageAssertion)].sort())
    expect(created.circleId).toBe(computeCircleId(ring(packageAssertion)))
    expect(verifyCircleManifest(created, {
      now: packageAssertion.created_at,
      profileId: RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id,
    }).valid).toBe(true)
  })

  it('rejects altered members, wrong profiles, expiry, revocation, and supersession', () => {
    const base = manifest()
    const alteredMembers = {
      ...base,
      members: ['f'.repeat(64), ...base.members.slice(1)].sort(),
    }
    const wrongProfile = verifyCircleManifest(base, {
      now: packageAssertion.created_at,
      profileId: 'relay-service-reputation',
    })
    const expired = verifyCircleManifest(base, {
      now: (base.expiresAt ?? 0) + 1,
      profileId: RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id,
    })
    const revoked = verifyCircleManifest({ ...base, status: 'revoked' }, {
      now: packageAssertion.created_at,
      profileId: RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id,
    })
    const superseded = verifyCircleManifest({ ...base, status: 'superseded' }, {
      now: packageAssertion.created_at,
      profileId: RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id,
    })

    expect(verifyCircleManifest(alteredMembers, {
      now: packageAssertion.created_at,
      profileId: RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id,
    }).errors.join('; ')).toContain('circleId does not match')
    expect(wrongProfile.errors.join('; ')).toContain('does not allow profile')
    expect(expired.errors.join('; ')).toContain('expired')
    expect(revoked.errors.join('; ')).toContain('revoked')
    expect(superseded.errors.join('; ')).toContain('superseded')
  })

  it('lets deployment policies use manifests instead of raw circle ids', () => {
    const circleManifest = manifest()
    const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      circleManifests: [circleManifest],
      expectedSubject: tagValue(packageAssertion, 'd'),
      metricPolicies: {
        rank: { required: true, min: 80, max: 100, integer: true },
      },
      rejectUnknownMetrics: true,
    })

    const accepted = verifyDeploymentPolicy(packageAssertion, policy, { now: packageAssertion.created_at })
    const expired = verifyDeploymentPolicy(packageAssertion, policy, { now: (circleManifest.expiresAt ?? 0) + 1 })

    expect(accepted.valid, accepted.errors.join('; ')).toBe(true)
    expect(expired.valid).toBe(false)
    expect(expired.errors.join('; ')).toContain('manifest is expired')
    expect(expired.errors.join('; ')).toContain('no accepted circle IDs')
  })

  it('rejects superseded raw circle ids when a manifest names the replacement', () => {
    const oldCircleId = computeCircleId(ring(packageAssertion))
    const replacement = createCircleManifest({
      issuedAt: packageAssertion.created_at ?? 0,
      members: [...ring(packageAssertion).slice(0, -1), 'f'.repeat(64)],
      name: 'Replacement package reviewers',
      profileIds: [RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id],
      purpose: 'Replacement review circle',
      supersedes: [oldCircleId],
    })
    const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [oldCircleId],
      circleManifests: [replacement],
      expectedSubject: tagValue(packageAssertion, 'd'),
    })
    const historicalPolicy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [oldCircleId],
      allowSupersededCircleIds: true,
      circleManifests: [replacement],
      expectedSubject: tagValue(packageAssertion, 'd'),
    })

    const result = verifyDeploymentPolicy(packageAssertion, policy, { now: packageAssertion.created_at })
    const historical = verifyDeploymentPolicy(packageAssertion, historicalPolicy, { now: packageAssertion.created_at })

    expect(result.valid).toBe(false)
    expect(result.supersededCircleIds).toContain(oldCircleId)
    expect(result.errors.join('; ')).toContain('circle is not accepted')
    expect(historical.valid, historical.errors.join('; ')).toBe(true)
  })
})
