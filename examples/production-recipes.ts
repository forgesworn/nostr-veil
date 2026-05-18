import {
  describeNip85Kind,
  signEvent,
} from 'nostr-veil'
import type { EventTemplate } from 'nostr-veil'
import {
  FEDERATED_MODERATION_PROFILE,
  LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE,
  NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
  RELAY_COMMUNITY_ADMISSION_PROFILE,
  RELAY_SERVICE_REPUTATION_PROFILE,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  type UseCaseProfile,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  createProductionDecisionReport,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  collectListLabelerCompanionEvidence,
  collectNip05DomainCompanionEvidence,
  collectPackageReleaseCompanionEvidence,
  listLabelerCompanionEvidenceRequirements,
  nip05DomainCompanionEvidenceRequirements,
  packageReleaseCompanionEvidenceRequirements,
  validateUseCaseProfileDefinition,
  verifyProductionDeployment,
} from 'nostr-veil/profiles'
import type { CompanionEvidence, EvidenceFetch, EvidenceFetchResponse } from 'nostr-veil/profiles'
import { assertion as listLabelerAssertion } from './use-cases/list-labeler-moderation-list-reputation.js'
import { assertion as nip05Assertion } from './use-cases/nip05-domain-service-provider-trust.js'
import { assertion as packageAssertion } from './use-cases/release-package-maintainer-reputation.js'
import { assertion as relayAdmissionAssertion } from './use-cases/relay-community-admission.js'
import { assertion as relayReputationAssertion } from './use-cases/relay-service-reputation.js'
import { events as moderationEvents } from './use-cases/federated-moderation.js'
import { keys } from './use-cases/_shared.js'

interface RecipeResult {
  action: string
  controlStatuses: Record<string, string>
  errors: string[]
  issueCodes: string[]
  kind: string
  name: string
  companionEvidence: string[]
  profileDefinitionWarnings: string[]
  remediations: string[]
  valid: boolean
  verifierAction: string
}

const BUNDLE_PUBLISHER_KEY = '44'.repeat(32)
const RELAY_PUBLISHER_KEY = '55'.repeat(32)

function jsonResponse(value: unknown): EvidenceFetchResponse {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify(value)).buffer
    },
    async json() {
      return value
    },
    async text() {
      return JSON.stringify(value)
    },
  }
}

function textResponse(value: string): EvidenceFetchResponse {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return new TextEncoder().encode(value).buffer
    },
    async json() {
      return JSON.parse(value)
    },
    async text() {
      return value
    },
  }
}

function fixtureFetch(routes: Record<string, EvidenceFetchResponse>): EvidenceFetch {
  return async (input) => {
    const response = routes[String(input)]
    if (response === undefined) throw new Error(`unexpected evidence fetch ${String(input)}`)
    return response
  }
}

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

function profileDefinitionWarnings(profile: UseCaseProfile): string[] {
  const validation = validateUseCaseProfileDefinition(profile)
  if (!validation.valid) {
    throw new Error(`${profile.id} profile definition failed: ${validation.errors.join('; ')}`)
  }
  return validation.warnings
}

function normaliseEvents(events: EventTemplate | readonly EventTemplate[]): EventTemplate[] {
  return Array.isArray(events) ? [...events] : [events as EventTemplate]
}

function verifyWithSignedBundle(
  events: EventTemplate | readonly EventTemplate[],
  policy: ReturnType<typeof createDeploymentPolicy>,
  companionEvidence: readonly CompanionEvidence[] = [],
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
    companionEvidence,
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

async function packageReleaseGate(): Promise<RecipeResult> {
  const profileWarnings = profileDefinitionWarnings(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE)
  const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
  const fetch = fixtureFetch({
    'https://registry.npmjs.org/nostr-veil': jsonResponse({
      versions: {
        '0.14.0': {
          dist: { integrity: 'sha512-demo-provenance' },
          name: 'nostr-veil',
          version: '0.14.0',
        },
      },
    }),
    'https://evidence.example.com/nostr-veil-0.14.0.spdx.json': jsonResponse({
      spdxVersion: 'SPDX-2.3',
      name: 'nostr-veil',
      versionInfo: '0.14.0',
    }),
    'https://api.osv.dev/v1/query': jsonResponse({ vulns: [] }),
  })
  const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
    circleManifests: [
      manifestFor(packageAssertion, RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.id, 'Package reviewers', 'Release safety review'),
    ],
    companionEvidence: packageReleaseCompanionEvidenceRequirements(subject, { maxAgeSeconds: 300 }),
    expectedSubject: subject,
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const companionEvidence = await collectPackageReleaseCompanionEvidence({
    checkedAt: packageAssertion.created_at ?? 0,
    fetch,
    osv: true,
    sbomUrl: 'https://evidence.example.com/nostr-veil-0.14.0.spdx.json',
    subject,
    verifyProvenance: packageVersion => packageVersion.dist?.integrity === 'sha512-demo-provenance',
  })
  const result = verifyWithSignedBundle(packageAssertion, policy, companionEvidence)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 85 ? 'surface-reviewed-release' : 'manual-review',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.kind),
    name: 'package-release-gate',
    companionEvidence: companionEvidence.map(item => item.id),
    profileDefinitionWarnings: profileWarnings,
    valid: result.valid,
  }
}

function relayServicePreference(): RecipeResult {
  const profileWarnings = profileDefinitionWarnings(RELAY_SERVICE_REPUTATION_PROFILE)
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
    companionEvidence: [],
    profileDefinitionWarnings: profileWarnings,
    valid: result.valid,
  }
}

async function nip05DomainWarning(): Promise<RecipeResult> {
  const profileWarnings = profileDefinitionWarnings(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE)
  const subject = canonicalNip05Subject('alice@example.com')
  const fetch = fixtureFetch({
    'https://example.com/.well-known/nostr.json?name=alice': jsonResponse({
      names: { alice: keys[0].pub },
    }),
  })
  const policy = createDeploymentPolicy(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE, {
    circleManifests: [
      manifestFor(nip05Assertion, NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE.id, 'Provider reviewers', 'NIP-05 and domain provider review'),
    ],
    companionEvidence: nip05DomainCompanionEvidenceRequirements(subject, { maxAgeSeconds: 300 }),
    expectedSubject: subject,
    expectedSubjectTagValue: '0',
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const companionEvidence = await collectNip05DomainCompanionEvidence({
    checkedAt: nip05Assertion.created_at ?? 0,
    checkDnsOwner: domain => domain === 'example.com',
    expectedPubkey: keys[0].pub,
    fetch,
    subject,
  })
  const result = verifyWithSignedBundle(nip05Assertion, policy, companionEvidence)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0

  return {
    action: result.valid && rank >= 80 ? 'show-provider-trust-signal' : 'show-provider-warning',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE.kind),
    name: 'nip05-domain-warning',
    companionEvidence: companionEvidence.map(item => item.id),
    profileDefinitionWarnings: profileWarnings,
    valid: result.valid,
  }
}

async function listLabelerSelection(): Promise<RecipeResult> {
  const profileWarnings = profileDefinitionWarnings(LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE)
  const subject = tagValue(listLabelerAssertion, 'd')
  const fetch = fixtureFetch({
    'https://labels.example.com/corrections': textResponse('ok'),
  })
  const policy = createDeploymentPolicy(LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE, {
    circleManifests: [
      manifestFor(listLabelerAssertion, LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE.id, 'List reviewers', 'List and labeler review'),
    ],
    companionEvidence: listLabelerCompanionEvidenceRequirements(subject, { maxAgeSeconds: 300 }),
    expectedSubject: subject,
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
      reaction_cnt: { required: true, min: 0, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const companionEvidence = await collectListLabelerCompanionEvidence({
    checkedAt: listLabelerAssertion.created_at ?? 0,
    correctionChannel: 'https://labels.example.com/corrections',
    fetch,
    listEvent: signEvent({
      content: '',
      created_at: listLabelerAssertion.created_at ?? 0,
      kind: 30000,
      tags: [
        ['d', 'trusted-relays'],
        ['relay', 'wss://relay.example.com'],
      ],
    }, keys[0].priv),
    sampleReview: { reviewedItems: 2, requiredItems: 1 },
    subject,
  })
  const result = verifyWithSignedBundle(listLabelerAssertion, policy, companionEvidence)
  const rank = result.valid ? firstMetric(result.deployment.metrics, 'rank') : 0
  const reactions = result.valid ? firstMetric(result.deployment.metrics, 'reaction_cnt') : 0

  return {
    action: result.valid && rank >= 75 && reactions >= 1 ? 'prefer-curation-source' : 'manual-list-review',
    ...recipeDiagnostics(result),
    kind: describeNip85Kind(LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE.kind),
    name: 'list-labeler-selection',
    companionEvidence: companionEvidence.map(item => item.id),
    profileDefinitionWarnings: profileWarnings,
    valid: result.valid,
  }
}

function federatedModerationReview(): RecipeResult {
  const profileWarnings = profileDefinitionWarnings(FEDERATED_MODERATION_PROFILE)
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
    companionEvidence: [],
    profileDefinitionWarnings: profileWarnings,
    valid: result.valid,
  }
}

function relayAdmissionGate(): RecipeResult {
  const profileWarnings = profileDefinitionWarnings(RELAY_COMMUNITY_ADMISSION_PROFILE)
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
    companionEvidence: [],
    profileDefinitionWarnings: profileWarnings,
    valid: result.valid,
  }
}

export const productionRecipeResults = await Promise.all([
  packageReleaseGate(),
  relayServicePreference(),
  nip05DomainWarning(),
  listLabelerSelection(),
  federatedModerationReview(),
  relayAdmissionGate(),
])

for (const result of productionRecipeResults) {
  console.log(`${result.name}: valid=${result.valid ? 'yes' : 'no'} kind="${result.kind}" action=${result.action} verifier=${result.verifierAction} evidence=${result.companionEvidence.join(',') || 'none'} profileWarnings=${result.profileDefinitionWarnings.length}`)
  if (!result.valid) {
    console.log(`  errors=${result.errors.join('; ')}`)
    console.log(`  issueCodes=${result.issueCodes.join(',')}`)
    console.log(`  remediations=${result.remediations.join(' | ')}`)
  }
  if (result.profileDefinitionWarnings.length > 0) {
    console.log(`  profileWarnings=${result.profileDefinitionWarnings.join(' | ')}`)
  }
}
