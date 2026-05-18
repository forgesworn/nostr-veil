import { signEvent } from 'nostr-veil'
import type { EventTemplate } from 'nostr-veil'
import {
  RELAY_COMMUNITY_ADMISSION_PROFILE,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  verifyAdmissionRequest,
} from 'nostr-veil/profiles'
import { assertion as relayAdmissionAssertion } from './use-cases/relay-community-admission.js'
import { keys, subjectPubkey } from './use-cases/_shared.js'

const BUNDLE_PUBLISHER_KEY = '66'.repeat(32)
const RELAY_PUBLISHER_KEY = '55'.repeat(32)
const audience = 'relay:wss://relay.example.com'

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

const now = relayAdmissionAssertion.created_at ?? Math.floor(Date.now() / 1000)
const manifest = createCircleManifest({
  issuedAt: now,
  expiresAt: now + 900,
  members: circleMembers(relayAdmissionAssertion),
  name: 'Admission reviewers',
  profileIds: [RELAY_COMMUNITY_ADMISSION_PROFILE.id],
  purpose: 'Relay admission review',
})
const policy = createDeploymentPolicy(RELAY_COMMUNITY_ADMISSION_PROFILE, {
  circleManifests: [manifest],
  expectedSubject: tagValue(relayAdmissionAssertion, 'd'),
  metricPolicies: {
    rank: { required: true, min: 0, max: 100, integer: true },
  },
  rejectUnknownMetrics: true,
  requireNostrSignature: true,
})
const bundle = createSignedDeploymentBundle(policy, {
  expiresAt: now + 900,
  id: 'relay-admission-gate',
  issuedAt: now,
  privateKey: BUNDLE_PUBLISHER_KEY,
})

const challenge = createAdmissionChallenge({
  applicantPubkey: subjectPubkey,
  audience,
  expiresAt: now + 60,
  issuedAt: now,
  nonce: 'ab'.repeat(32),
})
const presentation = createAdmissionPresentation(challenge, keys[3].priv, { createdAt: now + 1 })
const signedVouch = signEvent(relayAdmissionAssertion, RELAY_PUBLISHER_KEY)
const result = verifyAdmissionRequest(signedVouch, bundle, challenge, presentation, {
  expectedAudience: audience,
  now: now + 1,
  trustedPublishers: [bundle.signer],
})

console.log(
  `admission-gate: valid=${result.valid ? 'yes' : 'no'} decision=${result.decision} kind=${relayAdmissionAssertion.kind} applicant=${result.applicantPubkey.slice(0, 12)} rank=${result.rank ?? 'missing'}`,
)
if (!result.valid) {
  console.log(`  errors=${result.errors.join('; ')}`)
}
