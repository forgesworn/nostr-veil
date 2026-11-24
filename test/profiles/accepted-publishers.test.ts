import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  computeCircleId,
  computeEventId,
  contributeAssertion,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  signEvent,
  verifyDeploymentPolicy,
  verifyProductionDeployment,
  verifySignedDeploymentBundle,
} from '../../src/index.js'
import type { EventTemplate, UseCaseDeploymentPolicy } from '../../src/index.js'

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const SECOND_PUBLISHER_KEY = '66'.repeat(32)
const OUTSIDER_KEY = '77'.repeat(32)

function pubkey(privateKey: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(privateKey)))
}

const PUBLISHER = pubkey(PUBLISHER_KEY)
const SECOND_PUBLISHER = pubkey(SECOND_PUBLISHER_KEY)
const OUTSIDER = pubkey(OUTSIDER_KEY)

const members = ['11', '22', '33', 'aa', 'bb'].map(byte => {
  const priv = byte.repeat(32)
  return { priv, pub: pubkey(priv) }
})
const circle = createTrustCircle(members.map(member => member.pub))
const subject = 'dd'.repeat(32)
const reputation = USER_REPUTATION_ABUSE_REPORTING_PROFILE

/** Five reviewers score one account; the event carries the median. */
function scores(ranks: number[], createdAt = NOW): EventTemplate {
  const contributions = ranks.map((rank, index) => contributeAssertion(
    circle,
    subject,
    { rank },
    members[index].priv,
    circle.members.indexOf(members[index].pub),
    { proofVersion: 'v2' },
  ))
  return { ...aggregateContributions(circle, subject, contributions), created_at: createdAt }
}

/**
 * What anyone holding a published event can do with it: keep some of its
 * signatures and recompute the score from the values those signatures carry.
 * Nothing here needs a member's key.
 */
function republishSubset(event: EventTemplate, keep: number[]): EventTemplate {
  const signatureTags = event.tags.filter(tag => tag[0] === 'veil-sig')
  const kept = keep.map(index => signatureTags[index])
  const ranks = kept
    .map(tag => {
      const signature = JSON.parse(tag[1]) as { message: string }
      return (JSON.parse(signature.message) as { metrics: { rank: number } }).metrics.rank
    })
    .sort((a, b) => a - b)
  const middle = ranks.length / 2
  const median = ranks.length % 2 === 1
    ? ranks[Math.floor(middle)]
    : (ranks[middle - 1] + ranks[middle]) / 2

  return {
    ...event,
    tags: [
      ...event.tags
        .filter(tag => tag[0] !== 'veil-sig')
        .map(tag => {
          if (tag[0] === 'rank') return ['rank', String(median)]
          if (tag[0] === 'veil-threshold') return ['veil-threshold', String(kept.length), tag[2]]
          return tag
        }),
      ...kept,
    ],
  }
}

function codes(result: { issues?: ReadonlyArray<{ code: string }> }): string[] {
  return (result.issues ?? []).map(issue => issue.code)
}

// Three of five reviewers scored the account 20, so the honest median fails a gate of 70
const poorScores = scores([90, 90, 20, 20, 20])
const favourableSubset = republishSubset(poorScores, [0, 1, 2])
const goodScores = scores([90, 90, 85, 80, 75])

const gate = {
  acceptedCircleIds: [circle.circleId],
  expectedSubject: subject,
  metricPolicies: { rank: { required: true, min: 70 } },
  minDistinctSigners: 3,
}
const open = createDeploymentPolicy(reputation, gate)
const pinned = createDeploymentPolicy(reputation, { ...gate, acceptedPublishers: [PUBLISHER] })

describe('a policy that names no publisher', () => {
  it('rejects the honest event and accepts a favourable subset of it from anyone', () => {
    const honest = verifyDeploymentPolicy(signEvent(poorScores, PUBLISHER_KEY), open, { now: NOW })
    expect(honest.decision).toBe('reject')
    expect(honest.metrics.rank).toEqual([20])

    const subset = verifyDeploymentPolicy(signEvent(favourableSubset, OUTSIDER_KEY), open, { now: NOW })
    expect(subset.decision, subset.errors.join('; ')).toBe('accept')
    expect(subset.metrics.rank).toEqual([90])
    expect(subset.profileVerification.events[0].proof.distinctSigners).toBe(3)
    expect(subset.publishers).toEqual({ checked: false, valid: true })
  })

  it('accepts an old proof that anyone has republished with a new timestamp', () => {
    const policy = createDeploymentPolicy(reputation, { ...gate, maxAgeSeconds: 3600 })
    const lastYear = scores([90, 90, 85, 80, 75], NOW - 365 * 86_400)

    const stale = verifyDeploymentPolicy(signEvent(lastYear, PUBLISHER_KEY), policy, { now: NOW })
    expect(stale.errors).toEqual(['event[0] assertion is outside the accepted freshness window'])

    // The circle signs no time, so the same signatures pass as today's
    const refreshed = signEvent({ ...lastYear, created_at: NOW }, OUTSIDER_KEY)
    expect(verifyDeploymentPolicy(refreshed, policy, { now: NOW }).decision).toBe('accept')
  })
})

describe('a policy that names its publishers', () => {
  it('accepts an event from a named publisher', () => {
    const result = verifyDeploymentPolicy(signEvent(goodScores, PUBLISHER_KEY), pinned, { now: NOW })

    expect(result.decision, result.errors.join('; ')).toBe('accept')
    expect(result.publishers).toEqual({ checked: true, valid: true })
    expect(result.nostrSignatures).toEqual({ checked: true, valid: true })
  })

  it('rejects a favourable subset republished under another key', () => {
    const result = verifyDeploymentPolicy(signEvent(favourableSubset, OUTSIDER_KEY), pinned, { now: NOW })

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual(['event[0] publisher is not accepted by deployment policy'])
    expect(codes(result)).toEqual(['event.publisher_unaccepted'])
    expect(result.issues?.[0].path).toBe('event[0]')
    expect(result.publishers).toEqual({ checked: true, valid: false })
    // The Nostr signature itself is sound: it is the outsider's own
    expect(result.nostrSignatures).toEqual({ checked: true, valid: true })
  })

  it('rejects an old proof republished with a new timestamp under another key', () => {
    const policy = createDeploymentPolicy(reputation, {
      ...gate,
      acceptedPublishers: [PUBLISHER],
      maxAgeSeconds: 3600,
    })
    const lastYear = scores([90, 90, 85, 80, 75], NOW - 365 * 86_400)
    const refreshed = signEvent({ ...lastYear, created_at: NOW }, OUTSIDER_KEY)

    expect(codes(verifyDeploymentPolicy(refreshed, policy, { now: NOW }))).toEqual(['event.publisher_unaccepted'])
  })

  it('rejects a named publisher\'s id and signature grafted onto other tags', () => {
    const genuine = signEvent(poorScores, PUBLISHER_KEY)
    const grafted = { ...genuine, tags: favourableSubset.tags }
    const result = verifyDeploymentPolicy(grafted, pinned, { now: NOW })

    expect(result.errors).toEqual(['event[0] Nostr event signature is invalid'])
    expect(codes(result)).toEqual(['event.signature_invalid'])
    expect(result.publishers).toEqual({ checked: true, valid: false })
  })

  it('rejects an event that names a publisher it was not signed by', () => {
    const outsiders = signEvent(favourableSubset, OUTSIDER_KEY)
    const relabelled = { ...outsiders, pubkey: PUBLISHER }
    const reidentified = { ...relabelled, id: computeEventId(relabelled) }

    for (const forged of [relabelled, reidentified]) {
      const result = verifyDeploymentPolicy(forged, pinned, { now: NOW })
      expect(result.errors).toEqual(['event[0] Nostr event signature is invalid'])
      expect(result.publishers).toEqual({ checked: true, valid: false })
    }
  })

  it('rejects an unsigned event that only claims a named publisher', () => {
    const claimed = { ...favourableSubset, pubkey: PUBLISHER } as EventTemplate
    const result = verifyDeploymentPolicy(claimed, pinned, { now: NOW })

    expect(result.errors).toEqual(['event[0] is not a fully signed Nostr event'])
    expect(codes(result)).toEqual(['event.signature_missing'])
    expect(result.publishers).toEqual({ checked: true, valid: false })
  })

  it('checks the Nostr signature even when a hand-built policy turns that off', () => {
    const handBuilt: UseCaseDeploymentPolicy = { ...pinned, requireNostrSignature: false }
    const claimed = { ...favourableSubset, pubkey: PUBLISHER } as EventTemplate
    const result = verifyDeploymentPolicy(claimed, handBuilt, { now: NOW })

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual(['event[0] is not a fully signed Nostr event'])
    expect(result.nostrSignatures).toEqual({ checked: true, valid: false })
  })

  it('still trusts a named publisher to include every signature', () => {
    // The list says who may publish. It cannot say what they left out.
    const result = verifyDeploymentPolicy(signEvent(favourableSubset, PUBLISHER_KEY), pinned, { now: NOW })

    expect(result.decision).toBe('accept')
    expect(result.metrics.rank).toEqual([90])
  })

  it('checks every event of a federation', () => {
    const now = Math.max(...moderationEvents.map(event => event.created_at ?? 0))
    const options = {
      acceptedCircleIds: moderationEvents.map(event => computeCircleId(
        event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1) ?? [],
      )),
      expectedSubject: moderationEvents[0].tags.find(tag => tag[0] === 'd')?.[1] ?? '',
    }
    const signed = [
      signEvent(moderationEvents[0], PUBLISHER_KEY),
      signEvent(moderationEvents[1], SECOND_PUBLISHER_KEY),
    ]

    const both = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, {
      ...options,
      acceptedPublishers: [PUBLISHER, SECOND_PUBLISHER],
    })
    const accepted = verifyDeploymentPolicy(signed, both, { now })
    expect(accepted.decision, accepted.errors.join('; ')).toBe('accept')

    const one = createDeploymentPolicy(FEDERATED_MODERATION_PROFILE, { ...options, acceptedPublishers: [PUBLISHER] })
    const rejected = verifyDeploymentPolicy(signed, one, { now })
    expect(rejected.errors).toEqual(['event[1] publisher is not accepted by deployment policy'])
    expect(rejected.issues?.[0].path).toBe('event[1]')
  })
})

describe('creating a policy that names its publishers', () => {
  it('turns Nostr signature checking on and freezes the list', () => {
    expect(pinned.acceptedPublishers).toEqual([PUBLISHER])
    expect(Object.isFrozen(pinned.acceptedPublishers)).toBe(true)
    expect(pinned.requireNostrSignature).toBe(true)
  })

  it('leaves the field off a policy that names none', () => {
    expect('acceptedPublishers' in open).toBe(false)
    expect(open.requireNostrSignature).toBe(false)
  })

  it('refuses the list alongside requireNostrSignature: false', () => {
    expect(() => createDeploymentPolicy(reputation, {
      ...gate,
      acceptedPublishers: [PUBLISHER],
      requireNostrSignature: false,
    })).toThrow('requireNostrSignature cannot be false when acceptedPublishers is set: an unsigned event has no publisher')
  })

  it('refuses an empty, malformed or repeated list', () => {
    const create = (acceptedPublishers: unknown) => () => createDeploymentPolicy(reputation, {
      ...gate,
      acceptedPublishers: acceptedPublishers as string[],
    })

    expect(create([])).toThrow('acceptedPublishers must be a list of at least one publisher key')
    expect(create(PUBLISHER)).toThrow('acceptedPublishers must be a list of at least one publisher key')
    expect(create([PUBLISHER, 'npub1example']))
      .toThrow('acceptedPublishers[1] must be a 64-character lowercase hex string')
    expect(create([PUBLISHER.toUpperCase()]))
      .toThrow('acceptedPublishers[0] must be a 64-character lowercase hex string')
    expect(create([PUBLISHER, PUBLISHER])).toThrow('acceptedPublishers[1] is duplicated')
  })
})

describe('a policy read from JSON with a malformed publisher list', () => {
  const genuine = signEvent(goodScores, PUBLISHER_KEY)

  it.each([
    ['an empty list', [], 'acceptedPublishers must be a list of at least one publisher key'],
    ['null', null, 'acceptedPublishers must be a list of at least one publisher key'],
    ['a bare key', PUBLISHER, 'acceptedPublishers must be a list of at least one publisher key'],
    ['a list with one bad entry', [PUBLISHER, 'npub1example'], 'acceptedPublishers[1] must be a 64-character lowercase hex string'],
    ['an upper-case key', [PUBLISHER.toUpperCase()], 'acceptedPublishers[0] must be a 64-character lowercase hex string'],
    ['a list holding a non-string', [PUBLISHER, 7], 'acceptedPublishers[1] must be a 64-character lowercase hex string'],
  ])('fails closed on %s', (_name, acceptedPublishers, message) => {
    const policy = {
      ...(JSON.parse(JSON.stringify(pinned)) as UseCaseDeploymentPolicy),
      acceptedPublishers: acceptedPublishers as unknown as string[],
    }
    const result = verifyDeploymentPolicy(genuine, policy, { now: NOW })

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual([message])
    expect(codes(result)).toEqual(['policy.accepted_publishers_invalid'])
    expect(result.publishers).toEqual({ checked: true, valid: false })
  })

  it('still verifies a well-formed policy after a JSON round trip', () => {
    const policy = JSON.parse(JSON.stringify(pinned)) as UseCaseDeploymentPolicy
    expect(verifyDeploymentPolicy(genuine, policy, { now: NOW }).decision).toBe('accept')
    expect(codes(verifyDeploymentPolicy(signEvent(favourableSubset, OUTSIDER_KEY), policy, { now: NOW })))
      .toEqual(['event.publisher_unaccepted'])
  })
})

describe('a signed bundle that names its publishers', () => {
  const bundle = createSignedDeploymentBundle(pinned, {
    expiresAt: NOW + 600,
    id: 'reputation-gate',
    issuedAt: NOW,
    privateKey: OPERATOR_KEY,
  })
  const options = { now: NOW, trustedPublishers: [bundle.signer] }

  function publisherControl(event: EventTemplate, signedBundle = bundle) {
    const result = verifyProductionDeployment(event, signedBundle, options)
    const control = createProductionDecisionReport(result).controls.find(item => item.id === 'event-publisher')
    return { control, result }
  }

  it('carries the list through the production verifier and its report', () => {
    const accepted = publisherControl(signEvent(goodScores, PUBLISHER_KEY))
    expect(accepted.result.decision, accepted.result.errors.join('; ')).toBe('accept')
    expect(accepted.control?.status).toBe('pass')

    const rejected = publisherControl(signEvent(favourableSubset, OUTSIDER_KEY))
    expect(rejected.result.decision).toBe('reject')
    expect(codes(rejected.result)).toEqual(['event.publisher_unaccepted'])
    expect(rejected.control?.status).toBe('fail')
  })

  it('fails the publisher control when the event cannot be tied to a publisher', () => {
    const genuine = signEvent(poorScores, PUBLISHER_KEY)
    const grafted = publisherControl({ ...genuine, tags: favourableSubset.tags })

    expect(grafted.result.decision).toBe('reject')
    expect(grafted.control?.status).toBe('fail')
  })

  it('reports the publisher control as not checked when the policy names none', () => {
    const openBundle = createSignedDeploymentBundle(
      createDeploymentPolicy(reputation, { ...gate, requireNostrSignature: true }),
      { expiresAt: NOW + 600, id: 'open-gate', issuedAt: NOW, privateKey: OPERATOR_KEY },
    )
    const subset = publisherControl(signEvent(favourableSubset, OUTSIDER_KEY), openBundle)

    expect(subset.result.decision).toBe('accept')
    expect(subset.control?.status).toBe('not-checked')
    expect(subset.control?.summary).toContain('republish')
  })

  it('signs the list with the rest of the policy', () => {
    expect(verifySignedDeploymentBundle(bundle, options).valid).toBe(true)

    const widened = {
      ...bundle,
      policy: { ...bundle.policy, acceptedPublishers: [PUBLISHER, OUTSIDER] },
    }
    expect(verifySignedDeploymentBundle(widened, options).errors).toContain('bundle signature is invalid')

    const { acceptedPublishers: _dropped, ...unpinned } = bundle.policy
    expect(verifySignedDeploymentBundle({ ...bundle, policy: unpinned }, options).errors)
      .toContain('bundle signature is invalid')
  })
})
