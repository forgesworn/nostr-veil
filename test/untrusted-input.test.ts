import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { describe, expect, it } from 'vitest'
import {
  FEDERATED_MODERATION_PROFILE,
  USER_REPUTATION_ABUSE_REPORTING_PROFILE,
  aggregateContributions,
  computeEventId,
  contributeAssertion,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  createTrustCircle,
  signEvent,
  validateAssertion,
  validateAssertionStrict,
  validateProviderDeclarationStrict,
  verifyAdmissionPresentation,
  verifyAdmissionRequest,
  verifyDeploymentPolicy,
  verifyFederation,
  verifyProductionDeployment,
  verifyProof,
  verifySignedDeploymentBundle,
  verifySignedEvent,
  verifyUseCaseProfile,
} from '../src/index.js'
import type {
  AdmissionChallenge,
  AdmissionPresentation,
  EventTemplate,
  ProductionControlId,
  SignedDeploymentBundle,
  SignedEvent,
} from '../src/index.js'

// An event comes from a publisher by way of a relay, a bundle from wherever it
// is fetched, and an admission presentation from the applicant. None of them
// needs the operator's key, so whatever arrives must come back as a rejection.
// A verifier that throws on it can be stopped by anyone.

const NOW = 1_778_000_000
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const APPLICANT_KEY = '77'.repeat(32)
const STRANGER_KEY = '99'.repeat(32)
const audience = 'relay:wss://relay.example.com'

function pubkey(privateKey: string): string {
  return signEvent({ kind: 1, tags: [], content: '', created_at: 1 }, privateKey).pubkey
}

const profile = USER_REPUTATION_ABUSE_REPORTING_PROFILE
const members = ['11', '22', '33'].map(byte => ({ priv: byte.repeat(32), pub: pubkey(byte.repeat(32)) }))
const circle = createTrustCircle(members.map(member => member.pub))
const subject = pubkey(APPLICANT_KEY)
// One signer, under a threshold of one: every table below verifies this proof
// hundreds of times, and its cost grows with the number of signatures
const contributions = [contributeAssertion(
  circle,
  subject,
  { rank: 85 },
  members[0].priv,
  circle.members.indexOf(members[0].pub),
  { proofVersion: 'v2' },
)]
const assertion: EventTemplate = {
  ...aggregateContributions(circle, subject, contributions, { proofVersion: 'v2' }),
  created_at: NOW,
}
const signed = signEvent(assertion, PUBLISHER_KEY)

// The policy requires the outer Nostr signature, so that no altered event can pass
const policy = createDeploymentPolicy(profile, {
  acceptedCircleIds: [circle.circleId],
  expectedSubject: subject,
  minDistinctSigners: 1,
  requireNostrSignature: true,
})
const bundle = createSignedDeploymentBundle(policy, {
  expiresAt: NOW + 600,
  id: 'untrusted-input',
  issuedAt: NOW - 10,
  privateKey: OPERATOR_KEY,
})
const trusted = { now: NOW, trustedPublishers: [bundle.signer] }
const challenge = createAdmissionChallenge({
  applicantPubkey: subject,
  audience,
  expiresAt: NOW + 60,
  issuedAt: NOW - 10,
  nonce: 'cd'.repeat(32),
})
const presentation = createAdmissionPresentation(challenge, APPLICANT_KEY, { createdAt: NOW })
const admission = { ...trusted, expectedAudience: audience }

// What the report says of the policy inside a bundle
const POLICY_CONTROLS: ProductionControlId[] = [
  'event-signatures',
  'event-publisher',
  'circle-policy',
  'companion-evidence',
  'profile-subject',
  'proof-threshold',
  'metric-policy',
]

type Path = Array<string | number>
const REMOVED = Symbol('removed')
// JSON can carry an object whose `toString` is not a function. Putting one in a
// template, comparing it with `<`, or testing it against a pattern throws.
const UNPRINTABLE: unknown = JSON.parse('{"toString":1}')
// Turning a list into a string walks every level of it, and so does
// serialising it: ten thousand levels is about twenty kilobytes of JSON and
// more stack than either has.
const DEEP: unknown = (() => {
  let value: unknown = 'x'
  for (let level = 0; level < 10_000; level++) value = [value]
  return value
})()
const JUNK: unknown[] = [null, 42, 'abc', true, {}, [], [null], [[42]], UNPRINTABLE, DEEP, REMOVED]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Every place in a JSON value down to the given depth, the value itself included. */
function paths(value: unknown, depth: number, at: Path = []): Path[] {
  const found: Path[] = [at]
  if (at.length >= depth) return found
  if (Array.isArray(value)) {
    value.forEach((child, index) => found.push(...paths(child, depth, [...at, index])))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) found.push(...paths(child, depth, [...at, key]))
  }
  return found
}

function valueAt(base: unknown, path: Path): unknown {
  return path.reduce<unknown>((value, key) => (value as Record<string | number, unknown>)[key], base)
}

/** A copy of the value with one place replaced, or taken out. */
function replaced(base: unknown, path: Path, junk: unknown): unknown {
  if (path.length === 0) return junk === REMOVED ? undefined : junk
  const copy = clone(base)
  const parent = valueAt(copy, path.slice(0, -1)) as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (junk !== REMOVED) parent[last] = junk
  else if (Array.isArray(parent)) parent.splice(last as number, 1)
  else delete parent[last]
  return copy
}

function shown(path: Path, junk: unknown): string {
  const what = junk === REMOVED ? '(removed)' : junk === DEEP ? '(a list nested 10,000 deep)' : JSON.stringify(junk)
  return `${path.length === 0 ? '(the whole value)' : path.join('.')} = ${what}`
}

/** Every junk value at every place of the base, leaving out those that change nothing. */
function mutations(base: unknown, depth: number): Array<{ label: string; value: unknown }> {
  const found: Array<{ label: string; value: unknown }> = []
  for (const path of paths(base, depth)) {
    for (const junk of JUNK) {
      const value = replaced(base, path, junk)
      // The nested list cannot be serialised to compare, and is never what was there
      if (junk !== DEEP && JSON.stringify(value) === JSON.stringify(base)) continue
      found.push({ label: shown(path, junk), value })
    }
  }
  return found
}

/**
 * Run each check on each mutation and list what went wrong. A check returns
 * true when the input was turned away, false when it was let through.
 */
function failures(
  base: unknown,
  checks: Record<string, (value: never) => boolean>,
  depth = Number.POSITIVE_INFINITY,
): string[] {
  const found: string[] = []
  for (const { label, value } of mutations(base, depth)) {
    for (const [name, check] of Object.entries(checks)) {
      try {
        if (!check(value as never)) found.push(`${name} let through: ${label}`)
      } catch (error) {
        found.push(`${name} threw ${(error as Error).constructor.name} on: ${label}`)
      }
    }
  }
  return found
}

function controlStatuses(result: ReturnType<typeof verifyProductionDeployment>): Record<string, string> {
  return Object.fromEntries(createProductionDecisionReport(result).controls.map(control => [control.id, control.status]))
}

describe('the fixtures', () => {
  it('are accepted as they stand', () => {
    expect(verifyProductionDeployment(signed, bundle, trusted).decision).toBe('accept')
    expect(verifyAdmissionRequest(signed, bundle, challenge, presentation, admission).valid).toBe(true)
    expect(verifySignedEvent(signed)).toBe(true)
  })
})

describe('an event that is not what it should be', () => {
  it('is turned away by every verifier that requires its signature, and makes none throw', () => {
    expect(failures(signed, {
      // Admission wraps the production verifier, which wraps the bundle, the
      // policy, the profile and the proof: one call runs them all
      'the whole pipeline': (event: SignedEvent) => {
        const result = verifyAdmissionRequest(event, bundle, challenge, presentation, admission)
        return result.decision === 'deny'
          && result.deployment.decision === 'reject'
          && result.deployment.deployment.decision === 'reject'
          && createProductionDecisionReport(result.deployment).decision === 'reject'
      },
      verifySignedEvent: (event: SignedEvent) => !verifySignedEvent(event),
    })).toEqual([])
  })

  // These do not look at the outer signature, so an event altered only there
  // still passes them. What they must not do is throw. The profile and policy
  // verifiers are not repeated here: the pipeline above runs both on every
  // altered event.
  it('makes no verifier below them throw', () => {
    const answered = (result: { valid: boolean }) => typeof result.valid === 'boolean'

    expect(failures(signed, {
      verifyProof: (event: EventTemplate) => answered(verifyProof(event)),
      verifyFederation: (event: EventTemplate) => answered(verifyFederation([event])),
      validateAssertion: (event: EventTemplate) => answered(validateAssertion(event)),
      validateAssertionStrict: (event: EventTemplate) => answered(validateAssertionStrict(event)),
    })).toEqual([])
  })

  // A federation profile reads a scope tag from every event before anything
  // else. What that read depends on is the event, its tags and each tag as a
  // whole, so the table stops there.
  it('makes a federation profile turn it away without throwing', () => {
    expect(failures(signed, {
      'verifyUseCaseProfile (federation)': (event: EventTemplate) =>
        !verifyUseCaseProfile([event, event], FEDERATED_MODERATION_PROFILE, {
          acceptedCircleIds: [circle.circleId],
          now: NOW,
        }).valid,
    }, 2)).toEqual([])
  })

  it.each([
    ['no tags', { ...signed, tags: null }],
    ['a tag that is not a list', { ...signed, tags: [...signed.tags, null] }],
    ['a tag whose name is a number', { ...signed, tags: [...signed.tags, [42, '1']] }],
    ['an empty tag', { ...signed, tags: [...signed.tags, []] }],
    ['nothing at all', null],
  ])('is reported as a syntax error: %s', (_name, event) => {
    const result = verifyProductionDeployment(event as unknown as SignedEvent, bundle, trusted)

    expect(result.decision).toBe('reject')
    expect(result.issues.map(issue => issue.code)).toContain('nip85.syntax_invalid')
    expect(result.errors.some(error => /^event\[0\] syntax: Malformed (event|tag): /.test(error))).toBe(true)
  })

  it('is reported once as a syntax error when a metric value is not a string', () => {
    const numeric = { ...signed, tags: signed.tags.map(tag => tag[0] === 'rank' ? ['rank', 85] : tag) }
    const result = verifyProductionDeployment(numeric as unknown as SignedEvent, bundle, trusted)

    expect(result.decision).toBe('reject')
    expect(result.errors).toContain('event[0] syntax: Metric "rank" must be a string.')
  })

  // The policy was applied, but to an event with nothing in it to check
  it.each([
    ['no tags', { ...signed, tags: null }],
    ['nothing at all', null],
  ])('leaves no control of the report reading pass for a check that had nothing to read: %s', (_name, event) => {
    const statuses = controlStatuses(verifyProductionDeployment(event as unknown as SignedEvent, bundle, trusted))

    for (const id of ['circle-policy', 'profile-subject', 'proof-threshold', 'metric-policy', 'event-signatures']) {
      expect(statuses[id], id).toBe('fail')
    }
  })
})

describe('a provider declaration that is not what it should be', () => {
  const declaration = {
    kind: 10040,
    tags: [['30382:rank', members[0].pub, 'wss://relay.example.com']],
    content: '',
  }

  it('is valid as it stands', () => {
    expect(validateProviderDeclarationStrict(declaration)).toEqual({ valid: true, errors: [] })
  })

  it('does not make its validator throw', () => {
    expect(failures(declaration, {
      validateProviderDeclarationStrict: (event: typeof declaration) =>
        typeof validateProviderDeclarationStrict(event).valid === 'boolean',
    })).toEqual([])
  })
})

// Every one of these is the operator's own bundle with one place altered, which
// breaks its signature, so what is proved here is the path of a bundle that is
// not authentic. A malformed policy the operator signed is a different matter.
describe('a bundle that is not what it should be', () => {
  it('is turned away by every verifier, makes none throw, and its policy is never applied', () => {
    expect(failures(bundle, {
      verifySignedDeploymentBundle: (candidate: SignedDeploymentBundle) => !verifySignedDeploymentBundle(candidate, trusted).valid,
      'the whole pipeline': (candidate: SignedDeploymentBundle) => {
        const result = verifyAdmissionRequest(signed, candidate, challenge, presentation, admission)
        const statuses = controlStatuses(result.deployment)
        return result.decision === 'deny'
          && result.deployment.decision === 'reject'
          && result.deployment.deployment.decision === 'reject'
          && result.deployment.deployment.profileVerification.events.length === 0
          && POLICY_CONTROLS.every(id => statuses[id] === 'not-checked')
      },
      // The bundle, its policy, the profile inside that, and one level further.
      // Nothing below the bundle's own fields is read once the signature fails.
    }, 4)).toEqual([])
  })

  it('has no policy applied when another key signed it, however the policy is shaped', () => {
    const nested = (depth: number): unknown => {
      let value: unknown = 'x'
      for (let i = 0; i < depth; i++) value = [value]
      return value
    }
    const shapes: unknown[] = [null, 'abc', 42, [], {}, { profile: null }, { profile: {}, metricPolicies: null }, nested(20_000)]

    for (const shape of shapes) {
      let forged: SignedDeploymentBundle
      try {
        forged = createSignedDeploymentBundle(shape as never, {
          expiresAt: NOW + 600,
          id: 'forged',
          issuedAt: NOW - 10,
          privateKey: STRANGER_KEY,
        })
      } catch {
        // Not every shape can be signed. Send it under the operator's signature instead.
        forged = { ...bundle, policy: shape as never }
      }
      const result = verifyProductionDeployment(signed, forged, trusted)
      const statuses = controlStatuses(result)

      expect(result.decision).toBe('reject')
      expect(result.deployment.decision).toBe('reject')
      for (const id of POLICY_CONTROLS) expect(statuses[id], id).toBe('not-checked')
      expect(verifyAdmissionRequest(signed, forged, challenge, presentation, admission).decision).toBe('deny')
    }
  })

  // Before, a forged bundle had its policy applied, and the report read pass
  // for controls judged by rules that nobody trusted had signed
  it('is not judged by a policy that a stranger wrote', () => {
    const lenient = createSignedDeploymentBundle(
      createDeploymentPolicy(profile, { acceptedCircleIds: [circle.circleId], expectedSubject: subject }),
      { expiresAt: NOW + 600, id: 'lenient', issuedAt: NOW - 10, privateKey: STRANGER_KEY },
    )
    const result = verifyProductionDeployment(assertion, lenient, trusted)
    const statuses = controlStatuses(result)

    expect(result.decision).toBe('reject')
    expect(result.errors).toEqual(['bundle signer is not trusted'])
    expect(result.deployment.decision).toBe('reject')
    expect(statuses['bundle-publisher']).toBe('fail')
    for (const id of POLICY_CONTROLS) expect(statuses[id], id).toBe('not-checked')
  })

  // JSON.parse makes `__proto__` an ordinary key of the object it is in. A
  // serialiser that copies an object by assignment loses that one key, and with
  // it the signature's hold on whatever was put there: the bundle would still
  // read as the operator's, with content the operator never signed.
  it('is not authentic once a key named __proto__ is added inside its policy', () => {
    const text = JSON.stringify(bundle)
    /** The text with `"__proto__": value` as the first key of the object that opens at the marker. */
    const added = (marker: string, value: string): string => {
      const at = text.indexOf(marker)
      expect(at, marker).toBeGreaterThan(-1)
      const open = at + marker.length
      return `${text.slice(0, open)}"__proto__":${value}${text[open] === '}' ? '' : ','}${text.slice(open)}`
    }
    const altered: Array<[string, string, (parsed: SignedDeploymentBundle) => object]> = [
      ['the policy', added('"policy":{', '{"aggregate":"max"}'), parsed => parsed.policy],
      ['the metric policies, as null', added('"metricPolicies":{', 'null'), parsed => parsed.policy.metricPolicies],
      ['the metric policies, as a requirement', added('"metricPolicies":{', '{"required":true}'), parsed => parsed.policy.metricPolicies],
      ['the profile', added('"profile":{', '{"federation":{"minCircles":1,"requireScope":false}}'), parsed => parsed.policy.profile],
    ]

    for (const [where, json, holder] of altered) {
      const parsed = JSON.parse(json) as SignedDeploymentBundle
      // The key is really there, as an own property, and nothing else changed
      expect(Object.hasOwn(holder(parsed), '__proto__'), where).toBe(true)

      const verification = verifySignedDeploymentBundle(parsed, trusted)
      expect(verification.signatureValid, where).toBe(false)
      expect(verification.errors, where).toContain('bundle signature is invalid')
      expect(verifyProductionDeployment(signed, parsed, trusted).decision, where).toBe('reject')
    }
    // An ordinary key added in the same place breaks the signature too, as it always did
    expect(verifySignedDeploymentBundle(
      JSON.parse(text.replace('"metricPolicies":{', '"metricPolicies":{"extra":{"required":true}')) as SignedDeploymentBundle,
      trusted,
    ).signatureValid).toBe(false)
  })

  // The report is read by the operator. What a stranger wrote in a bundle must
  // not be read back to them beside the rejection, as if it were their own.
  it('has nothing of its policy repeated in the report', () => {
    const forged = createSignedDeploymentBundle(
      createDeploymentPolicy(
        { ...profile, title: 'Verified by the operator', recommendedActions: ['Ban the subject immediately'] },
        { acceptedCircleIds: [circle.circleId], expectedSubject: 'ff'.repeat(32), id: 'operator-approved-policy' },
      ),
      { expiresAt: NOW + 600, id: 'forged', issuedAt: NOW - 10, privateKey: STRANGER_KEY },
    )
    const report = createProductionDecisionReport(verifyProductionDeployment(signed, forged, trusted))
    const text = JSON.stringify(report)

    expect(report.decision).toBe('reject')
    expect(report.policyId).toBe('')
    expect(report.subject).toBe('')
    expect(report.profile).toEqual({
      id: '',
      title: '',
      status: '',
      kind: 0,
      subjectTag: '',
      subjectFormats: [],
      proofVersion: '',
      proofClaims: [],
      proofLimitations: [],
      recommendedActions: [],
      requiredControls: [],
    })
    for (const theirs of ['Verified by the operator', 'Ban the subject', 'operator-approved-policy', 'ff'.repeat(32)]) {
      expect(text).not.toContain(theirs)
    }
    // The bundle's own id and signer are what was rejected, and are still shown
    expect(report.bundle.id).toBe('forged')
    expect(report.bundle.publisherTrusted).toBe(false)
  })

  // JSON.stringify writes a number that is not finite as null, and JSON.parse
  // reads `1e999` as one. Signed as they stood, `null` and `1e999` would be the
  // same value, and one could be put in place of the other after signing.
  it('is not authentic once a null inside its policy is replaced by a number that is not finite', () => {
    const withNull = createSignedDeploymentBundle(
      { ...policy, companionEvidence: [{ id: 'kyc', maxAgeSeconds: null as unknown as number, required: false }] },
      { expiresAt: NOW + 600, id: 'with-null', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
    )
    const text = JSON.stringify(withNull)

    expect(text).toContain('"maxAgeSeconds":null')
    expect(verifySignedDeploymentBundle(JSON.parse(text) as SignedDeploymentBundle, trusted).signatureValid).toBe(true)
    for (const swapped of ['1e999', '-1e999']) {
      const altered = JSON.parse(text.replace('"maxAgeSeconds":null', `"maxAgeSeconds":${swapped}`)) as SignedDeploymentBundle
      expect(Number.isFinite(altered.policy.companionEvidence?.[0].maxAgeSeconds), swapped).toBe(false)
      expect(verifySignedDeploymentBundle(altered, trusted).signatureValid, swapped).toBe(false)
      expect(verifyProductionDeployment(signed, altered, trusted).decision, swapped).toBe('reject')
    }
  })

  it('cannot be signed with a number that is not finite inside it', () => {
    expect(() => createSignedDeploymentBundle(
      { ...policy, maxAgeSeconds: Number.POSITIVE_INFINITY },
      { expiresAt: NOW + 600, id: 'infinite', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
    )).toThrow('a signed value cannot hold a number that is not finite')
  })

  it('is reported without its policy being read when the verification time cannot be compared either', () => {
    for (const shape of [null, 'abc', 42, { circleManifests: 'abc' }, { circleManifests: [{}] }]) {
      const forged = { ...bundle, policy: shape } as unknown as SignedDeploymentBundle
      const result = verifyProductionDeployment(signed, forged, { ...trusted, now: Number.NaN })
      const statuses = controlStatuses(result)

      expect(result.decision, JSON.stringify(shape)).toBe('reject')
      expect(result.errors, JSON.stringify(shape)).toContain('now must be a Unix timestamp')
      expect(statuses['bundle-freshness'], JSON.stringify(shape)).toBe('fail')
      for (const id of POLICY_CONTROLS) expect(statuses[id], `${id} ${JSON.stringify(shape)}`).toBe('not-checked')
    }
  })

  it('still has its policy applied when it is authentic but out of date', () => {
    const result = verifyProductionDeployment(signed, bundle, { ...trusted, now: NOW + 3600 })
    const statuses = controlStatuses(result)

    expect(result.decision).toBe('reject')
    expect(result.deployment.profileVerification.events).toHaveLength(1)
    expect(statuses['bundle-freshness']).toBe('fail')
    expect(statuses['event-signatures']).toBe('pass')
  })
})

describe('a report on a check that did not run', () => {
  it('never reads pass for the event controls when no event was supplied', () => {
    const result = verifyProductionDeployment([], bundle, trusted)
    const statuses = controlStatuses(result)

    expect(result.decision).toBe('reject')
    expect(result.deployment.profileVerification.events).toHaveLength(0)
    for (const id of ['event-signatures', 'circle-policy', 'proof-threshold', 'metric-policy']) {
      expect(statuses[id], id).toBe('not-checked')
    }
    expect(statuses['profile-subject']).toBe('fail')
  })

  // A policy that names its publishers checks each assertion's publisher too
  it('never reads pass for the publisher control when no event was supplied', () => {
    const named = createSignedDeploymentBundle(
      createDeploymentPolicy(profile, {
        acceptedCircleIds: [circle.circleId],
        acceptedPublishers: [pubkey(PUBLISHER_KEY)],
        expectedSubject: subject,
        minDistinctSigners: 1,
      }),
      { expiresAt: NOW + 600, id: 'named-publishers', issuedAt: NOW - 10, privateKey: OPERATOR_KEY },
    )
    const options = { now: NOW, trustedPublishers: [named.signer] }

    expect(controlStatuses(verifyProductionDeployment(signed, named, options))['event-publisher']).toBe('pass')
    expect(controlStatuses(verifyProductionDeployment([], named, options))['event-publisher']).toBe('not-checked')
  })

  // The signer field of a bundle is a claim until the signature bears it out
  it('does not say a bundle came from a trusted publisher when its signature does not verify', () => {
    const result = verifyProductionDeployment(signed, { ...bundle, id: 'another-id' }, trusted)
    const statuses = controlStatuses(result)

    expect(result.bundle.publisherTrusted).toBe(true)
    expect(result.bundle.signatureValid).toBe(false)
    expect(statuses['bundle-signature']).toBe('fail')
    expect(statuses['bundle-publisher']).toBe('fail')
    // Nor that it is in date: no signature covers the dates it carries
    expect(statuses['bundle-freshness']).toBe('fail')
  })
})

// Each of these was accepted by 0.37.0 and is turned away now. None is a
// well-formed Nostr event or declaration. They are pinned here so that each
// change is a decision that a later edit has to make again, not an accident.
describe('input that was let through before', () => {
  const resigned = (tags: unknown[][]): SignedEvent => signEvent({ ...assertion, tags: tags as string[][] }, PUBLISHER_KEY)
  const swapped = (name: string, tag: unknown[]): SignedEvent =>
    resigned(assertion.tags.map(existing => existing[0] === name ? tag : existing))

  it.each([
    ['a number after the value of a p tag', () => swapped('p', ['p', subject, 42])],
    ['a number after the value of an alt tag', () => resigned([...assertion.tags, ['alt', 'summary', 7]])],
    ['a number after the value of an expiration tag', () => resigned([...assertion.tags, ['expiration', String(NOW + 600), 7]])],
    ['a threshold given as numbers', () => swapped('veil-threshold', ['veil-threshold', 1, 3])],
  ])('is turned away by the proof verifier, though the publisher signed it: %s', (_name, build) => {
    const event = build()
    const result = verifyProductionDeployment(event, bundle, trusted)

    expect(verifySignedEvent(event)).toBe(true)
    expect(result.decision).toBe('reject')
    expect(result.errors).toContain('event[0] proof: Malformed tag: every tag element must be a string')
  })

  it('is not read as a number when a metric value is a list', () => {
    const ranked = (value: unknown) =>
      ({ ...assertion, tags: assertion.tags.map(tag => tag[0] === 'rank' ? ['rank', value] : tag) }) as unknown as EventTemplate

    for (const value of [[85], [], [null]]) {
      expect(validateAssertion(ranked(value)).valid, JSON.stringify(value)).toBe(false)
    }
    expect(validateAssertion({ kind: 30382, tags: [['d', subject], ['followers', [5]]], content: '' } as unknown as EventTemplate).valid)
      .toBe(false)
    // A value that is a number, as a builder outside this library might write it, still reads as one here
    expect(validateAssertion(ranked(85)).valid).toBe(true)
  })

  it('is not read as a string when a relay hint is a list', () => {
    const declared = (hint: unknown) =>
      ({ kind: 10040, tags: [['30382:rank', members[0].pub, hint]], content: '' }) as unknown as EventTemplate

    expect(validateProviderDeclarationStrict(declared('wss://relay.example.com')).valid).toBe(true)
    expect(validateProviderDeclarationStrict(declared(['wss://relay.example.com'])).valid).toBe(false)
  })

  // Compared as it stood, a list of one number read as that number, and any
  // other list or object as neither stale nor fresh, which passed
  it('is turned away when created_at is a list or an object', () => {
    const unsigned = createDeploymentPolicy(profile, {
      acceptedCircleIds: [circle.circleId],
      expectedSubject: subject,
      minDistinctSigners: 1,
    })

    expect(verifyDeploymentPolicy(assertion, unsigned, { now: NOW }).decision).toBe('accept')
    for (const createdAt of [{}, ['abc'], [NOW]]) {
      const result = verifyDeploymentPolicy({ ...assertion, created_at: createdAt } as unknown as EventTemplate, unsigned, { now: NOW })

      expect(result.decision, JSON.stringify(createdAt)).toBe('reject')
      expect(result.errors, JSON.stringify(createdAt)).toEqual(['event[0] assertion created_at is not a Unix timestamp'])
    }
  })

  // Read from JSON, `1e999` is infinity: later than any date, so never stale
  it('is turned away when an unsigned event is dated at a number that is not finite', () => {
    const unsigned = createDeploymentPolicy(profile, {
      acceptedCircleIds: [circle.circleId],
      expectedSubject: subject,
      minDistinctSigners: 1,
    })
    const text = JSON.stringify({ ...assertion, created_at: 0 })

    for (const date of ['1e999', '-1e999']) {
      const event = JSON.parse(text.replace('"created_at":0', `"created_at":${date}`)) as EventTemplate
      const result = verifyDeploymentPolicy(event, unsigned, { now: NOW })

      expect(result.decision, date).toBe('reject')
      expect(result.errors, date).toEqual(['event[0] assertion created_at is not a Unix timestamp'])
    }
  })

  // An event id is a hash of JSON, which has no form for a number that is not
  // finite and writes it as null. An id made over a date of minus infinity is
  // therefore the id for plus infinity too: one that is stale for ever, and
  // one that never goes stale.
  it('is not a signed event when its date is a number that is not finite', () => {
    const body = {
      pubkey: pubkey(PUBLISHER_KEY),
      created_at: Number.NEGATIVE_INFINITY,
      kind: assertion.kind,
      tags: assertion.tags,
      content: assertion.content,
    }
    const id = computeEventId(body)
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), hexToBytes(PUBLISHER_KEY)))
    const text = JSON.stringify({ ...body, created_at: 0, id, sig })

    expect(computeEventId({ ...body, created_at: Number.POSITIVE_INFINITY })).toBe(id)
    for (const date of ['-1e999', '1e999']) {
      const event = JSON.parse(text.replace('"created_at":0', `"created_at":${date}`)) as SignedEvent

      expect(Number.isFinite(event.created_at), date).toBe(false)
      expect(verifySignedEvent(event), date).toBe(false)
      expect(verifyProductionDeployment(event, bundle, trusted).decision, date).toBe('reject')
    }
  })
})

describe('an admission presentation that is not what it should be', () => {
  it('is denied, and makes no verifier throw', () => {
    expect(failures(presentation, {
      verifyAdmissionPresentation: (candidate: AdmissionPresentation) =>
        !verifyAdmissionPresentation(candidate, challenge, { now: NOW }).valid,
    })).toEqual([])
    expect(failures(presentation, {
      verifyAdmissionRequest: (candidate: AdmissionPresentation) =>
        verifyAdmissionRequest(signed, bundle, challenge, candidate, admission).decision === 'deny',
    }, 1)).toEqual([])
  })

  it('is denied against a challenge that is not what it should be', () => {
    expect(failures(challenge, {
      verifyAdmissionPresentation: (candidate: AdmissionChallenge) =>
        !verifyAdmissionPresentation(presentation, candidate, { now: NOW }).valid,
    })).toEqual([])
    expect(failures(challenge, {
      verifyAdmissionRequest: (candidate: AdmissionChallenge) =>
        verifyAdmissionRequest(signed, bundle, candidate, presentation, admission).decision === 'deny',
    }, 1)).toEqual([])
  })
})
