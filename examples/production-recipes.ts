import {
  computeCircleId,
  signEvent,
} from 'nostr-veil'
import type { EventTemplate } from 'nostr-veil'
import {
  FEDERATED_MODERATION_PROFILE,
  NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
  RELAY_COMMUNITY_ADMISSION_PROFILE,
  RELAY_SERVICE_REPUTATION_PROFILE,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  createDeploymentPolicy,
  verifyDeploymentPolicy,
} from 'nostr-veil/profiles'
import { assertion as nip05Assertion } from './use-cases/nip05-domain-service-provider-trust.js'
import { assertion as packageAssertion } from './use-cases/release-package-maintainer-reputation.js'
import { assertion as relayAdmissionAssertion } from './use-cases/relay-community-admission.js'
import { assertion as relayReputationAssertion } from './use-cases/relay-service-reputation.js'
import { events as moderationEvents } from './use-cases/federated-moderation.js'

interface RecipeResult {
  action: string
  errors: string[]
  name: string
  valid: boolean
}

function tagValue(event: EventTemplate, name: string): string {
  const value = event.tags.find(tag => tag[0] === name)?.[1]
  if (value === undefined) throw new Error(`missing ${name} tag`)
  return value
}

function circleId(event: EventTemplate): string {
  const ring = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (ring === undefined) throw new Error('missing veil-ring tag')
  return computeCircleId(ring)
}

function firstMetric(metrics: Record<string, number[]>, name: string): number {
  const value = metrics[name]?.[0]
  if (value === undefined) throw new Error(`missing verified metric ${name}`)
  return value
}

function sumMetric(metrics: Record<string, number[]>, name: string): number {
  return metrics[name]?.reduce((sum, value) => sum + value, 0) ?? 0
}

function packageReleaseGate(): RecipeResult {
  const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
  const signed = signEvent(packageAssertion, '55'.repeat(32))
  const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
    acceptedCircleIds: [circleId(packageAssertion)],
    expectedSubject: subject,
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const result = verifyDeploymentPolicy(signed, policy, { now: signed.created_at })
  const rank = result.valid ? firstMetric(result.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 85 ? 'surface-reviewed-release' : 'manual-review',
    errors: result.errors,
    name: 'package-release-gate',
    valid: result.valid,
  }
}

function relayServicePreference(): RecipeResult {
  const policy = createDeploymentPolicy(RELAY_SERVICE_REPUTATION_PROFILE, {
    acceptedCircleIds: [circleId(relayReputationAssertion)],
    expectedSubject: tagValue(relayReputationAssertion, 'd'),
    expectedSubjectTagValue: '10002',
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
      reaction_cnt: { required: true, min: 0, integer: true },
    },
    rejectUnknownMetrics: true,
  })
  const result = verifyDeploymentPolicy(relayReputationAssertion, policy, {
    now: relayReputationAssertion.created_at,
  })
  const rank = result.valid ? firstMetric(result.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 75 ? 'prefer-relay' : 'do-not-prefer-relay',
    errors: result.errors,
    name: 'relay-service-preference',
    valid: result.valid,
  }
}

function nip05DomainWarning(): RecipeResult {
  const subject = canonicalNip05Subject('alice@example.com')
  const policy = createDeploymentPolicy(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE, {
    acceptedCircleIds: [circleId(nip05Assertion)],
    expectedSubject: subject,
    expectedSubjectTagValue: '0',
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
  })
  const result = verifyDeploymentPolicy(nip05Assertion, policy, { now: nip05Assertion.created_at })
  const rank = result.valid ? firstMetric(result.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 80 ? 'show-provider-trust-signal' : 'show-provider-warning',
    errors: result.errors,
    name: 'nip05-domain-warning',
    valid: result.valid,
  }
}

function federatedModerationReview(): RecipeResult {
  const policy = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
    acceptedCircleIds: moderationEvents.map(circleId),
    expectedSubject: tagValue(moderationEvents[0], 'd'),
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
      reports_cnt_recd: { required: true, min: 0, integer: true },
    },
    rejectUnknownMetrics: true,
  })
  const result = verifyDeploymentPolicy(moderationEvents, policy, {
    now: Math.max(...moderationEvents.map(event => event.created_at ?? 0)),
  })
  const reportCount = result.valid ? sumMetric(result.metrics, 'reports_cnt_recd') : 0

  return {
    action: result.valid && reportCount >= 4 ? 'queue-human-moderation-review' : 'no-automatic-action',
    errors: result.errors,
    name: 'federated-moderation-review',
    valid: result.valid,
  }
}

function relayAdmissionGate(): RecipeResult {
  const policy = createDeploymentPolicy(RELAY_COMMUNITY_ADMISSION_PROFILE, {
    acceptedCircleIds: [circleId(relayAdmissionAssertion)],
    expectedSubject: tagValue(relayAdmissionAssertion, 'd'),
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
  })
  const result = verifyDeploymentPolicy(relayAdmissionAssertion, policy, {
    now: relayAdmissionAssertion.created_at,
  })
  const rank = result.valid ? firstMetric(result.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 90 ? 'admit-with-standard-rate-limits' : 'manual-admission-review',
    errors: result.errors,
    name: 'relay-admission-gate',
    valid: result.valid,
  }
}

export const productionRecipeResults = [
  packageReleaseGate(),
  relayServicePreference(),
  nip05DomainWarning(),
  federatedModerationReview(),
  relayAdmissionGate(),
]

for (const result of productionRecipeResults) {
  console.log(`${result.name}: valid=${result.valid ? 'yes' : 'no'} action=${result.action}`)
  if (!result.valid) {
    console.log(`  errors=${result.errors.join('; ')}`)
  }
}
