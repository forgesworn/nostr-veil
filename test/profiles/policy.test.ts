import { describe, expect, it } from 'vitest'
import { assertion as listLabelerAssertion } from '../../examples/use-cases/list-labeler-moderation-list-reputation.js'
import { assertion as nip05Assertion } from '../../examples/use-cases/nip05-domain-service-provider-trust.js'
import { assertion as packageAssertion } from '../../examples/use-cases/release-package-maintainer-reputation.js'
import { assertion as relayAssertion } from '../../examples/use-cases/relay-service-reputation.js'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'
import {
  FEDERATED_MODERATION_PROFILE,
  LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE,
  NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  RELAY_SERVICE_REPUTATION_PROFILE,
  computeCircleId,
  createDeploymentPolicy,
  signEvent,
  verifyDeploymentPolicy,
} from '../../src/index.js'
import type { EventTemplate, UseCaseDeploymentPolicy } from '../../src/index.js'

function tagValue(event: EventTemplate, name: string): string {
  const value = event.tags.find(tag => tag[0] === name)?.[1]
  if (value === undefined) throw new Error(`missing ${name} tag`)
  return value
}

function circleId(event: EventTemplate): string {
  const ring = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (ring === undefined) throw new Error('missing veil-ring')
  return computeCircleId(ring)
}

function cloneEvent(event: EventTemplate): EventTemplate {
  return {
    kind: event.kind,
    tags: event.tags.map(tag => [...tag]),
    content: event.content,
    ...(event.created_at === undefined ? {} : { created_at: event.created_at }),
  }
}

describe('deployment policies', () => {
  it('accepts a production-shaped package reputation policy', () => {
    const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      expectedSubject: tagValue(packageAssertion, 'd'),
      metricPolicies: {
        rank: { required: true, min: 80, max: 100, integer: true },
      },
      rejectUnknownMetrics: true,
    })

    const result = verifyDeploymentPolicy(packageAssertion, policy, { now: packageAssertion.created_at })

    expect(result.valid, result.errors.join('; ')).toBe(true)
    expect(result.decision).toBe('accept')
    expect(result.metrics.rank).toEqual([87])
    expect(result.nostrSignatures.checked).toBe(false)
  })

  it('requires companion evidence for package, provider, and list deployment decisions', () => {
    const cases = [
      {
        evidenceIds: ['npm-provenance', 'sbom', 'vulnerability-feed'],
        event: packageAssertion,
        profile: RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
      },
      {
        evidenceIds: ['nip05-resolution', 'https-probe', 'dns-owner-check'],
        event: nip05Assertion,
        profile: NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
      },
      {
        evidenceIds: ['list-revision-fetch', 'sample-review', 'correction-channel'],
        event: listLabelerAssertion,
        profile: LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE,
      },
    ] as const

    for (const entry of cases) {
      const subject = tagValue(entry.event, 'd')
      const policy = createDeploymentPolicy(entry.profile, {
        acceptedCircleIds: [circleId(entry.event)],
        companionEvidence: entry.evidenceIds.map(id => ({
          id,
          expectedSubject: subject,
          maxAgeSeconds: 300,
        })),
        expectedSubject: subject,
        ...(entry.profile.subjectTagValue === undefined ? {} : { expectedSubjectTagValue: entry.profile.subjectTagValue }),
        metricPolicies: {
          rank: { required: true, min: 0, max: 100, integer: true },
        },
        requireNostrSignature: false,
      })

      const missing = verifyDeploymentPolicy(entry.event, policy, { now: entry.event.created_at })
      const accepted = verifyDeploymentPolicy(entry.event, policy, {
        companionEvidence: entry.evidenceIds.map(id => ({
          checkedAt: entry.event.created_at ?? 0,
          id,
          status: 'pass',
          subject,
        })),
        now: entry.event.created_at,
      })

      expect(missing.valid, `${entry.profile.id} accepted missing companion evidence`).toBe(false)
      expect(missing.errors.join('; '), entry.profile.id).toContain('companion evidence')
      expect(accepted.valid, `${entry.profile.id}: ${accepted.errors.join('; ')}`).toBe(true)
      expect(accepted.companionEvidence.valid, entry.profile.id).toBe(true)
    }
  })

  it('rejects failed, stale, and wrong-subject companion evidence', () => {
    const subject = tagValue(packageAssertion, 'd')
    const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      companionEvidence: [
        {
          id: 'npm-provenance',
          expectedSubject: subject,
          maxAgeSeconds: 300,
        },
      ],
      expectedSubject: subject,
      metricPolicies: {
        rank: { required: true, min: 0, max: 100, integer: true },
      },
    })

    const failed = verifyDeploymentPolicy(packageAssertion, policy, {
      companionEvidence: [{ checkedAt: packageAssertion.created_at ?? 0, id: 'npm-provenance', status: 'fail', subject }],
      now: packageAssertion.created_at,
    })
    const stale = verifyDeploymentPolicy(packageAssertion, policy, {
      companionEvidence: [{ checkedAt: (packageAssertion.created_at ?? 0) - 301, id: 'npm-provenance', status: 'pass', subject }],
      now: packageAssertion.created_at,
    })
    const wrongSubject = verifyDeploymentPolicy(packageAssertion, policy, {
      companionEvidence: [{ checkedAt: packageAssertion.created_at ?? 0, id: 'npm-provenance', status: 'pass', subject: 'npm:nostr-veil@999.0.0' }],
      now: packageAssertion.created_at,
    })

    expect(failed.valid).toBe(false)
    expect(failed.issues?.map(issue => issue.code)).toContain('companion.failed')
    expect(stale.valid).toBe(false)
    expect(stale.issues?.map(issue => issue.code)).toContain('companion.stale')
    expect(wrongSubject.valid).toBe(false)
    expect(wrongSubject.issues?.map(issue => issue.code)).toContain('companion.subject_mismatch')
  })

  it('can require a valid Nostr event signature for relay-fetched assertions', () => {
    const signed = signEvent(packageAssertion, '55'.repeat(32))
    const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      expectedSubject: tagValue(packageAssertion, 'd'),
      metricPolicies: {
        rank: { required: true, min: 80, max: 100 },
      },
      requireNostrSignature: true,
    })

    const accepted = verifyDeploymentPolicy(signed, policy, { now: signed.created_at })
    const rejected = verifyDeploymentPolicy(packageAssertion, policy, { now: packageAssertion.created_at })

    expect(accepted.valid, accepted.errors.join('; ')).toBe(true)
    expect(accepted.nostrSignatures).toEqual({ checked: true, valid: true })
    expect(rejected.valid).toBe(false)
    expect(rejected.errors.join('; ')).toContain('fully signed Nostr event')
  })

  it('keeps legacy accepted-circle policies valid without manifest fields', () => {
    const currentPolicy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      expectedSubject: tagValue(packageAssertion, 'd'),
    })
    const legacyPolicy = { ...currentPolicy } as Partial<UseCaseDeploymentPolicy>
    delete legacyPolicy.circleManifests
    delete legacyPolicy.allowSupersededCircleIds

    const result = verifyDeploymentPolicy(packageAssertion, legacyPolicy as UseCaseDeploymentPolicy, {
      now: packageAssertion.created_at,
    })

    expect(result.valid, result.errors.join('; ')).toBe(true)
  })

  it('rejects policies without accepted circles before runtime', () => {
    expect(() =>
      createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
        acceptedCircleIds: [],
        expectedSubject: tagValue(packageAssertion, 'd'),
      }),
    ).toThrow(/acceptedCircleIds/)
  })

  it('rejects otherwise-valid assertions that miss deployment-specific controls', () => {
    const tooStrict = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      expectedSubject: tagValue(packageAssertion, 'd'),
      metricPolicies: {
        rank: { required: true, min: 90, max: 100 },
      },
    })
    const wrongSubject = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      expectedSubject: 'npm:nostr-veil@999.0.0',
      metricPolicies: {
        rank: { required: true, min: 0, max: 100 },
      },
    })
    const stale = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(packageAssertion)],
      expectedSubject: tagValue(packageAssertion, 'd'),
      maxAgeSeconds: 300,
    })

    expect(verifyDeploymentPolicy(packageAssertion, tooStrict, { now: packageAssertion.created_at }).errors.join('; '))
      .toContain('below deployment minimum')
    expect(verifyDeploymentPolicy(packageAssertion, wrongSubject, { now: packageAssertion.created_at }).errors.join('; '))
      .toContain('expected subject')
    expect(verifyDeploymentPolicy(packageAssertion, stale, { now: packageAssertion.created_at + 301 }).errors.join('; '))
      .toContain('freshness window')
  })

  it('can reject valid but deployment-unexpected metrics', () => {
    const policy = createDeploymentPolicy(RELAY_SERVICE_REPUTATION_PROFILE, {
      acceptedCircleIds: [circleId(relayAssertion)],
      expectedSubject: tagValue(relayAssertion, 'd'),
      expectedSubjectTagValue: '10002',
      metricPolicies: {
        rank: { required: true, min: 0, max: 100 },
      },
      rejectUnknownMetrics: true,
    })

    const result = verifyDeploymentPolicy(relayAssertion, policy, { now: relayAssertion.created_at })

    expect(result.valid).toBe(false)
    expect(result.errors.join('; ')).toContain('reaction_cnt')
  })

  it('verifies federated moderation policy across accepted scoped circles', () => {
    const policy = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
      acceptedCircleIds: moderationEvents.map(circleId),
      expectedSubject: tagValue(moderationEvents[0], 'd'),
      metricPolicies: {
        rank: { required: true, min: 0, max: 100, integer: true },
        reports_cnt_recd: { required: true, min: 0, integer: true },
      },
      rejectUnknownMetrics: true,
    })

    const result = verifyDeploymentPolicy(moderationEvents.map(cloneEvent), policy, {
      now: Math.max(...moderationEvents.map(event => event.created_at ?? 0)),
    })

    expect(result.valid, result.errors.join('; ')).toBe(true)
    expect(result.profileVerification.federation?.distinctSigners).toBe(4)
    expect(result.metrics.rank).toEqual([35, 40])
    expect(result.metrics.reports_cnt_recd).toEqual([2, 2])
  })
})
