import {
  describeNip85Kind,
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
  createProductionDecisionReport,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  verifyProductionDeployment,
} from 'nostr-veil/profiles'
import { assertion as nip05Assertion } from './use-cases/nip05-domain-service-provider-trust.js'
import { assertion as packageAssertion } from './use-cases/release-package-maintainer-reputation.js'
import { assertion as relayAdmissionAssertion } from './use-cases/relay-community-admission.js'
import { assertion as relayReputationAssertion } from './use-cases/relay-service-reputation.js'
import { events as moderationEvents } from './use-cases/federated-moderation.js'

interface RecipeResult {
  action: string
  controlStatuses: Record<string, string>
  errors: string[]
  issueCodes: string[]
  kind: string
  name: string
  remediations: string[]
  valid: boolean
  verifierAction: string
}

const BUNDLE_PUBLISHER_KEY = '44'.repeat(32)
const RELAY_PUBLISHER_KEY = '55'.repeat(32)

function tagValue(event: EventTemplate, name: string): string {
  const value = event.tags.find(tag => tag[0] === name)?.[1]
  if (value === undefined) throw new Error(`missing ${name} tag`)
  return value
}

function circleMembers(event: EventTemplate): string[] {
  const members = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (members === undefined) throw new Error('missing veil-ring tag')
  return members
}

function manifestFor(
  event: EventTemplate,
  profileId: string,
  name: string,
  purpose: string,
) {
  return createCircleManifest({
    issuedAt: event.created_at ?? 0,
    expiresAt: (event.created_at ?? 0) + 900,
    members: circleMembers(event),
    name,
    profileIds: [profileId],
    purpose,
  })
}

function firstMetric(metrics: Record<string, number[]>, name: string): number {
  const value = metrics[name]?.[0]
  if (value === undefined) throw new Error(`missing verified metric ${name}`)
  return value
}

function sumMetric(metrics: Record<string, number[]>, name: string): number {
  return metrics[name]?.reduce((sum, value) => sum + value, 0) ?? 0
}

function normaliseEvents(events: EventTemplate | readonly EventTemplate[]): EventTemplate[] {
  return Array.isArray(events) ? [...events] : [events as EventTemplate]
}

function verifyWithSignedBundle(
  events: EventTemplate | readonly EventTemplate[],
  policy: ReturnType<typeof createDeploymentPolicy>,
) {
  const signedEvents = normaliseEvents(events).map(event => signEvent(event, RELAY_PUBLISHER_KEY))
  const now = Math.max(...signedEvents.map(event => event.created_at))
  const bundle = createSignedDeploymentBundle(policy, {
    expiresAt: now + 900,
    id: policy.id,
    issuedAt: now,
    privateKey: BUNDLE_PUBLISHER_KEY,
  })

  return verifyProductionDeployment(signedEvents, bundle, {
    now,
    trustedPublishers: [bundle.signer],
  })
}

function recipeDiagnostics(result: ReturnType<typeof verifyWithSignedBundle>) {
  const report = createProductionDecisionReport(result)

  return {
    controlStatuses: Object.fromEntries(report.controls.map(control => [control.id, control.status])),
    errors: result.errors,
    issueCodes: report.issues.map(issue => issue.code),
    remediations: [...report.remediations],
    verifierAction: report.recommendedAction,
  }
}

function packageReleaseGate(): RecipeResult {
  const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
  const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
    circleManifests: [
      manifestFor(packageAssertion, RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id, 'Package reviewers', 'Release safety review'),
    ],
    expectedSubject: subject,
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const result = verifyWithSignedBundle(packageAssertion, policy)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 85 ? 'surface-reviewed-release' : 'manual-review',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.kind),
    name: 'package-release-gate',
    valid: result.valid,
  }
}

function relayServicePreference(): RecipeResult {
  const policy = createDeploymentPolicy(RELAY_SERVICE_REPUTATION_PROFILE, {
    circleManifests: [
      manifestFor(relayReputationAssertion, RELAY_SERVICE_REPUTATION_PROFILE.id, 'Relay reviewers', 'Relay and service review'),
    ],
    expectedSubject: tagValue(relayReputationAssertion, 'd'),
    expectedSubjectTagValue: '10002',
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
      reaction_cnt: { required: true, min: 0, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const result = verifyWithSignedBundle(relayReputationAssertion, policy)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 75 ? 'prefer-relay' : 'do-not-prefer-relay',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(RELAY_SERVICE_REPUTATION_PROFILE.kind),
    name: 'relay-service-preference',
    valid: result.valid,
  }
}

function nip05DomainWarning(): RecipeResult {
  const subject = canonicalNip05Subject('alice@example.com')
  const policy = createDeploymentPolicy(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE, {
    circleManifests: [
      manifestFor(nip05Assertion, NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE.id, 'Provider reviewers', 'NIP-05 and domain provider review'),
    ],
    expectedSubject: subject,
    expectedSubjectTagValue: '0',
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const result = verifyWithSignedBundle(nip05Assertion, policy)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 80 ? 'show-provider-trust-signal' : 'show-provider-warning',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE.kind),
    name: 'nip05-domain-warning',
    valid: result.valid,
  }
}

function federatedModerationReview(): RecipeResult {
  const policy = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
    circleManifests: moderationEvents.map((event, index) =>
      manifestFor(event, FEDERATED_MODERATION_PROFILE.id, `Moderation circle ${index + 1}`, 'Federated moderation review'),
    ),
    expectedSubject: tagValue(moderationEvents[0], 'd'),
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
      reports_cnt_recd: { required: true, min: 0, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const result = verifyWithSignedBundle(moderationEvents, policy)
  const reportCount = result.valid ? sumMetric(result.deployment.metrics, 'reports_cnt_recd') : 0

  return {
    action: result.valid && reportCount >= 4 ? 'queue-human-moderation-review' : 'no-automatic-action',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(FEDERATED_MODERATION_PROFILE.kind),
    name: 'federated-moderation-review',
    valid: result.valid,
  }
}

function relayAdmissionGate(): RecipeResult {
  const policy = createDeploymentPolicy(RELAY_COMMUNITY_ADMISSION_PROFILE, {
    circleManifests: [
      manifestFor(relayAdmissionAssertion, RELAY_COMMUNITY_ADMISSION_PROFILE.id, 'Admission reviewers', 'Relay or community admission review'),
    ],
    expectedSubject: tagValue(relayAdmissionAssertion, 'd'),
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const result = verifyWithSignedBundle(relayAdmissionAssertion, policy)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 90 ? 'admit-with-standard-rate-limits' : 'manual-admission-review',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(RELAY_COMMUNITY_ADMISSION_PROFILE.kind),
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
  console.log(`${result.name}: valid=${result.valid ? 'yes' : 'no'} kind="${result.kind}" action=${result.action} verifier=${result.verifierAction}`)
  if (!result.valid) {
    console.log(`  errors=${result.errors.join('; ')}`)
    console.log(`  issueCodes=${result.issueCodes.join(',')}`)
    console.log(`  remediations=${result.remediations.join(' | ')}`)
  }
}
