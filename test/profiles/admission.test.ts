import { describe, expect, it } from 'vitest'
import { assertion as relayAdmissionAssertion } from '../../examples/use-cases/relay-community-admission.js'
import { keys, subjectPubkey } from '../../examples/use-cases/_shared.js'
import {
  NIP85_KINDS,
  RELAY_COMMUNITY_ADMISSION_PROFILE,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  signEvent,
  verifyAdmissionPresentation,
  verifyAdmissionRequest,
} from '../../src/index.js'
import type { EventTemplate } from '../../src/index.js'

const BUNDLE_PUBLISHER_KEY = '66'.repeat(32)
const RELAY_PUBLISHER_KEY = '55'.repeat(32)
const audience = 'relay:wss://relay.example.com'
const now = relayAdmissionAssertion.created_at ?? 0

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

function signedBundle() {
  const manifest = createCircleManifest({
    issuedAt: now,
    expiresAt: now + 900,
    members: circleMembers(relayAdmissionAssertion),
    name: 'Admission reviewers',
    profileIds: [RELAY_COMMUNITY_ADMISSION_PROFILE.id],
    purpose: 'Relay admission test',
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

  return createSignedDeploymentBundle(policy, {
    expiresAt: now + 900,
    id: 'relay-admission-gate',
    issuedAt: now,
    privateKey: BUNDLE_PUBLISHER_KEY,
  })
}

function challengeFor(applicantPubkey = subjectPubkey) {
  return createAdmissionChallenge({
    applicantPubkey,
    audience,
    expiresAt: now + 60,
    issuedAt: now,
    nonce: 'ab'.repeat(32),
  })
}

describe('relay/community admission reference flow', () => {
  it('verifies an additive admission handshake around an unchanged NIP-85 30382 vouch', () => {
    const challenge = challengeFor()
    const presentation = createAdmissionPresentation(challenge, keys[3].priv, { createdAt: now + 1 })
    const vouch = signEvent(relayAdmissionAssertion, RELAY_PUBLISHER_KEY)
    const bundle = signedBundle()
    const result = verifyAdmissionRequest(vouch, bundle, challenge, presentation, {
      expectedAudience: audience,
      now: now + 1,
      trustedPublishers: [bundle.signer],
    })

    expect(relayAdmissionAssertion.kind).toBe(NIP85_KINDS.USER)
    expect(relayAdmissionAssertion.tags.some(tag => tag[0].startsWith('admission-'))).toBe(false)
    expect(result.valid, result.errors.join('; ')).toBe(true)
    expect(result.decision).toBe('admit')
    expect(result.applicantPubkey).toBe(subjectPubkey)
    expect(result.presentation.signatureValid).toBe(true)
    expect(result.deployment.valid).toBe(true)
  })

  it('rejects replayed, wrong-audience, and expired presentations before admission policy runs', () => {
    const challenge = challengeFor()
    const presentation = createAdmissionPresentation(challenge, keys[3].priv, { createdAt: now + 1 })

    const replayed = verifyAdmissionPresentation(presentation, challenge, {
      now: now + 1,
      usedChallengeIds: [challenge.id],
    })
    const wrongAudience = verifyAdmissionPresentation(presentation, challenge, {
      expectedAudience: 'relay:wss://other.example.com',
      now: now + 1,
    })
    const expired = verifyAdmissionPresentation(presentation, challenge, {
      now: now + 61,
    })

    expect(replayed.valid).toBe(false)
    expect(replayed.errors.join('; ')).toContain('already been used')
    expect(wrongAudience.valid).toBe(false)
    expect(wrongAudience.errors.join('; ')).toContain('audience does not match')
    expect(expired.valid).toBe(false)
    expect(expired.errors.join('; ')).toContain('expired')
  })

  it('reports malformed presentations instead of treating them as weak admissions', () => {
    const challenge = challengeFor()
    const presentation = createAdmissionPresentation(challenge, keys[3].priv, { createdAt: now + 1 })
    const malformed = verifyAdmissionPresentation({
      ...presentation,
      createdAt: -1,
      signature: 'bad',
    }, challenge, { now: now + 1 })

    expect(malformed.valid).toBe(false)
    expect(malformed.errors.join('; ')).toContain('presentation createdAt')
    expect(malformed.errors.join('; ')).toContain('presentation signature')
  })

  it('rejects a valid presentation when the vouch is for a different pubkey', () => {
    const challenge = challengeFor(keys[2].pub)
    const presentation = createAdmissionPresentation(challenge, keys[2].priv, { createdAt: now + 1 })
    const vouch = signEvent(relayAdmissionAssertion, RELAY_PUBLISHER_KEY)
    const bundle = signedBundle()
    const result = verifyAdmissionRequest(vouch, bundle, challenge, presentation, {
      expectedAudience: audience,
      now: now + 1,
      trustedPublishers: [bundle.signer],
    })

    expect(result.valid).toBe(false)
    expect(result.decision).toBe('deny')
    expect(result.errors.join('; ')).toContain('vouch subject does not match presentation applicant')
  })

  it('separates proof validity from admission action bands and revocation policy', () => {
    const challenge = challengeFor()
    const presentation = createAdmissionPresentation(challenge, keys[3].priv, { createdAt: now + 1 })
    const vouch = signEvent(relayAdmissionAssertion, RELAY_PUBLISHER_KEY)
    const bundle = signedBundle()

    const rateLimited = verifyAdmissionRequest(vouch, bundle, challenge, presentation, {
      admitRank: 95,
      expectedAudience: audience,
      now: now + 1,
      rateLimitRank: 90,
      trustedPublishers: [bundle.signer],
    })
    const revoked = verifyAdmissionRequest(vouch, bundle, challenge, presentation, {
      expectedAudience: audience,
      now: now + 1,
      revokedApplicantPubkeys: [subjectPubkey],
      trustedPublishers: [bundle.signer],
    })

    expect(rateLimited.valid).toBe(true)
    expect(rateLimited.decision).toBe('rate-limit')
    expect(revoked.valid).toBe(false)
    expect(revoked.decision).toBe('revoke')
    expect(revoked.errors.join('; ')).toContain('applicant is revoked')
  })
})
