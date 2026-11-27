import { describe, expect, it } from 'vitest'
import { assertion as claim } from '../../examples/use-cases/event-claim-verification.js'
import { events as moderationEvents } from '../../examples/use-cases/federated-moderation.js'
import { assertion as vouch } from '../../examples/use-cases/relay-community-admission.js'
import { keys, subjectPubkey } from '../../examples/use-cases/_shared.js'
import {
  EVENT_CLAIM_VERIFICATION_PROFILE,
  FEDERATED_MODERATION_PROFILE,
  RELAY_COMMUNITY_ADMISSION_PROFILE,
  computeCircleId,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createDeploymentPolicy,
  createProductionDecisionReport,
  createSignedDeploymentBundle,
  signEvent,
  verifyAdmissionRequest,
  verifyProductionDeployment,
} from '../../src/index.js'
import type { DeploymentMetricPolicy, EventTemplate, UseCaseProfile } from '../../src/index.js'

// The metric policy bounds the metrics an assertion publishes. It read one
// value for each metric name, the last tag of that name with a value, so it
// did not look at every tag the event gives:
// - A second tag of a metric's name, placed before the signed one, was never
//   held to the bounds.
// - A tag with no value was passed over, so beside a signed tag it was not
//   reported, and an unknown name with no value was not reported as unknown.
// - A blank value, such as '' or ' ', was read as 0, as Number() reads it.
// The proof verifier and the strict syntax check, which keep the first tag of
// a name and report the rest, turned each such event away all the same. The
// policy now reads every tag of a metric's name wherever it is placed, and the
// value of a metric only where the event gives it once.

const NOW = claim.created_at
const OPERATOR_KEY = '44'.repeat(32)
const PUBLISHER_KEY = '55'.repeat(32)
const NOT_SATISFIED = 'At least one metric is missing, unexpected, non-numeric, non-integer, or outside the deployment bounds, or a bound in the policy is malformed.'
const SATISFIED = 'The published metrics satisfy the deployment metric policy.'

const tagOf = (event: EventTemplate, name: string) => event.tags.find(tag => tag[0] === name)!
const ringOf = (event: EventTemplate) => tagOf(event, 'veil-ring').slice(1)
const template = (event: EventTemplate, tags: unknown[][]): EventTemplate => ({
  kind: event.kind, tags: tags as string[][], content: event.content, created_at: event.created_at,
})
// A tag value that is not a string comes from JSON, as it would from a relay
const json = (text: string): unknown[] => JSON.parse(text) as unknown[]

type Place = 'before' | 'after' | 'both sides'
const PLACES: Place[] = ['before', 'after', 'both sides']
function placed(event: EventTemplate, tag: unknown[], place: Place | 'in place', replacing?: string): unknown[][] {
  if (place === 'before') return [tag, ...event.tags]
  if (place === 'after') return [...event.tags, tag]
  if (place === 'both sides') return [tag, ...event.tags, tag]
  return event.tags.map(existing => existing[0] === replacing ? tag : existing)
}

function bundleFor(profile: UseCaseProfile, events: EventTemplate[], options: {
  metricPolicies: Record<string, DeploymentMetricPolicy>
  rejectUnknownMetrics?: boolean
}) {
  const policy = createDeploymentPolicy(profile, {
    acceptedCircleIds: [...new Set(events.map(event => computeCircleId(ringOf(event))))],
    expectedSubject: tagOf(events[0], 'd')[1],
    requireNostrSignature: true,
    now: NOW,
    ...options,
  })
  return createSignedDeploymentBundle(policy, {
    expiresAt: NOW + 600, id: 'metric-tags', issuedAt: NOW - 10, privateKey: OPERATOR_KEY,
  })
}

function production(events: EventTemplate | EventTemplate[], bundle: ReturnType<typeof bundleFor>) {
  const list = Array.isArray(events) ? events : [events]
  const signed = list.map(event => signEvent(template(event, event.tags), PUBLISHER_KEY))
  const result = verifyProductionDeployment(Array.isArray(events) ? signed : signed[0], bundle, {
    now: NOW, trustedPublishers: [bundle.signer],
  })
  const report = createProductionDecisionReport(result)
  const control = (id: string) => report.controls.find(item => item.id === id)!
  // The metric policy's own issues. The syntax check files a value it reads as
  // no number under the metric code too, at the event.
  const codes = () => (result.issues ?? [])
    .filter(issue => issue.code.startsWith('metric.') && !/^event\[\d+\] syntax: /u.test(issue.message))
    .map(issue => `${issue.code} ${issue.path}`)
  return { result, report, control, codes }
}

// The claim publishes rank 74 and reaction_cnt 2
const BOUNDS = { rank: { min: 0, max: 100 }, reaction_cnt: { min: 0, max: 10 } }
const claimBundle = bundleFor(EVENT_CLAIM_VERIFICATION_PROFILE, [claim], { metricPolicies: BOUNDS })
const integerBundle = bundleFor(EVENT_CLAIM_VERIFICATION_PROFILE, [claim], {
  metricPolicies: { rank: { min: 0, max: 100, integer: true }, reaction_cnt: { min: 0, max: 10, integer: true } },
})
const requiredBundle = bundleFor(EVENT_CLAIM_VERIFICATION_PROFILE, [claim], {
  metricPolicies: { ...BOUNDS, reaction_cnt: { min: 0, max: 10, required: true } },
})
const strictBundle = bundleFor(EVENT_CLAIM_VERIFICATION_PROFILE, [claim], { metricPolicies: BOUNDS, rejectUnknownMetrics: true })
const withTags = (tags: unknown[][]) => template(claim, tags)
const PATH = 'event[0].tags.reaction_cnt'
// What the policy reads of the other metric, where one of the two is changed
const OTHER = { rank: { reaction_cnt: [2] }, reaction_cnt: { rank: [74] } }

describe('the metric policy reads every tag of a metric name', () => {
  it('accepts the claim as published, and reads each metric once (guard)', () => {
    const run = production(claim, claimBundle)
    expect(run.result.decision).toBe('accept')
    expect(run.control('metric-policy')).toMatchObject({ status: 'pass', summary: SATISFIED })
    expect(run.result.deployment.metrics).toEqual({ rank: [74], reaction_cnt: [2] })
    expect(run.report.metrics).toEqual({ rank: [74], reaction_cnt: [2] })
  })

  const FAULTS: Array<[string, string, string, ReturnType<typeof bundleFor>]> = [
    ['above the maximum', '1000000', 'metric.above_max', claimBundle],
    ['below the minimum', '-1', 'metric.below_min', claimBundle],
    ['not an integer where one is required', '1.5', 'metric.integer_required', integerBundle],
    ['a word', 'abc', 'metric.invalid_value', claimBundle],
    ['overflowing to Infinity', '1e400', 'metric.invalid_value', claimBundle],
    ['overflowing to -Infinity', '-1e400', 'metric.invalid_value', claimBundle],
    ['blank', '', 'metric.invalid_value', claimBundle],
    ['whitespace', ' ', 'metric.invalid_value', claimBundle],
  ]
  // A value that is no number, placed last, was read before, as the last tag
  // with a value, and reported as no number
  const READ_WHEN_LAST = new Set(['a word', 'overflowing to Infinity', 'overflowing to -Infinity'])
  for (const name of ['rank', 'reaction_cnt'] as const) {
    const rows: Array<[string, unknown[], string, ReturnType<typeof bundleFor>]> = [
      ...FAULTS.map(([label, value, code, bundle]): [string, unknown[], string, ReturnType<typeof bundleFor>] => [label, [name, value], code, bundle]),
      ['with no value', [name], 'metric.invalid_value', claimBundle],
    ]
    for (const [label, tag, code, bundle] of rows) {
      for (const place of PLACES) {
        const guard = READ_WHEN_LAST.has(label) && place !== 'before' ? ' (guard)' : ''
        it(`holds a second ${name} ${label}, placed ${place}, to the policy${guard}`, () => {
          const run = production(withTags(placed(claim, tag, place)), bundle)
          expect(run.result.decision).toBe('reject')
          expect(run.codes()).toEqual([`${code} event[0].tags.${name}`])
          expect(run.control('metric-policy')).toMatchObject({ status: 'fail', summary: NOT_SATISFIED })
          // Of two values, neither is the metric's
          expect(run.result.deployment.metrics).toEqual(OTHER[name])
          expect(run.report.metrics).toEqual(OTHER[name])
        })
      }
    }

    for (const place of PLACES) {
      it(`leaves the metric control passing for a second ${name} within the bounds, placed ${place}, which the syntax and proof checks fail`, () => {
        const run = production(withTags(placed(claim, [name, name === 'rank' ? '80' : '3'], place)), claimBundle)
        expect(run.result.decision).toBe('reject')
        expect(run.codes()).toEqual([])
        expect(run.control('metric-policy')).toMatchObject({ status: 'pass', summary: SATISFIED })
        expect(run.control('profile-subject').status).toBe('fail')
        expect(run.control('proof-threshold').status).toBe('fail')
        expect(run.result.deployment.metrics).toEqual(OTHER[name])
      })
    }
  }

  it('holds each value to the bounds, and names each fault once', () => {
    const run = production(withTags([['reaction_cnt', '-1'], ['reaction_cnt', 'abc'], ...claim.tags, ['reaction_cnt', '1000000'], ['reaction_cnt', '-2']]), claimBundle)
    expect(run.codes()).toEqual([`metric.invalid_value ${PATH}`, `metric.below_min ${PATH}`, `metric.above_max ${PATH}`])
  })

  it('accepts a value on a bound, which the bounds include (guard)', () => {
    const onTheBounds = bundleFor(EVENT_CLAIM_VERIFICATION_PROFILE, [claim], {
      metricPolicies: { rank: { min: 74, max: 74 }, reaction_cnt: { min: 2, max: 2 } },
    })
    const run = production(claim, onTheBounds)
    expect(run.result.decision).toBe('accept')
    expect(run.codes()).toEqual([])
    expect(run.control('metric-policy')).toMatchObject({ status: 'pass', summary: SATISFIED })
  })

  for (const name of ['rank', 'reaction_cnt'] as const) {
    for (const value of ['', ' ', '\n', '\u00a0']) {
      it(`reads a lone blank ${name} (${JSON.stringify(value)}) as no number, not as 0`, () => {
        const run = production(withTags(placed(claim, [name, value], 'in place', name)), claimBundle)
        expect(run.result.decision).toBe('reject')
        expect(run.codes()).toEqual([`metric.invalid_value event[0].tags.${name}`])
        expect(run.control('metric-policy')).toMatchObject({ status: 'fail', summary: NOT_SATISFIED })
        expect(run.result.deployment.metrics).toEqual(OTHER[name])
      })
    }

    it(`reports a lone ${name} with no value as no number`, () => {
      const run = production(withTags(placed(claim, [name], 'in place', name)), claimBundle)
      expect(run.codes()).toEqual([`metric.invalid_value event[0].tags.${name}`])
      expect(run.control('metric-policy')).toMatchObject({ status: 'fail', summary: NOT_SATISFIED })
      expect(run.result.deployment.metrics).toEqual(OTHER[name])
    })

    // Read as 0, a blank value was reported against a bound that does not admit 0
    it(`reports a lone blank ${name} under a minimum of 1 as no number, not as below the minimum`, () => {
      const minimumOne = bundleFor(EVENT_CLAIM_VERIFICATION_PROFILE, [claim], {
        metricPolicies: { rank: { min: 1, max: 100 }, reaction_cnt: { min: 1, max: 10 } },
      })
      const run = production(withTags(placed(claim, [name, ''], 'in place', name)), minimumOne)
      expect(run.result.decision).toBe('reject')
      expect(run.codes()).toEqual([`metric.invalid_value event[0].tags.${name}`])
      expect(run.report.recommendedAction).toBe('reject')
    })
  }

  it('still reports a required reaction_cnt with no value as missing, and as no number', () => {
    const run = production(withTags(placed(claim, ['reaction_cnt'], 'in place', 'reaction_cnt')), requiredBundle)
    expect(run.codes()).toEqual(['metric.required_missing event[0]', `metric.invalid_value ${PATH}`])
  })

  it('reports a required reaction_cnt that is blank as no number, not as missing', () => {
    const run = production(withTags(placed(claim, ['reaction_cnt', ''], 'in place', 'reaction_cnt')), requiredBundle)
    expect(run.codes()).toEqual([`metric.invalid_value ${PATH}`])
  })

  for (const place of PLACES) {
    it(`does not report a required reaction_cnt as missing beside a second with no value, placed ${place}`, () => {
      const run = production(withTags(placed(claim, ['reaction_cnt'], place)), requiredBundle)
      expect(run.codes()).toEqual([`metric.invalid_value ${PATH}`])
    })
  }

  it('still reports a required reaction_cnt left out as missing (guard)', () => {
    const run = production(withTags(claim.tags.filter(tag => tag[0] !== 'reaction_cnt')), requiredBundle)
    expect(run.codes()).toEqual(['metric.required_missing event[0]'])
    expect(run.result.deployment.metrics).toEqual({ rank: [74] })
  })

  it('reads a reaction_cnt whose value is not a string as none, and fails the control as unreadable (guard)', () => {
    const run = production(withTags(placed(claim, json('["reaction_cnt", 2]'), 'in place', 'reaction_cnt')), requiredBundle)
    expect(run.codes()).toEqual(['metric.required_missing event[0]'])
    expect(run.control('metric-policy').status).toBe('fail')
    expect(run.result.deployment.metrics).toEqual({ rank: [74] })
  })

  for (const place of PLACES) {
    it(`counts a second reaction_cnt whose value is not a string, placed ${place}, so the metric has no single value`, () => {
      const run = production(withTags(placed(claim, json('["reaction_cnt", 2]'), place)), claimBundle)
      expect(run.result.decision).toBe('reject')
      expect(run.codes()).toEqual([])
      expect(run.control('metric-policy').status).toBe('fail')
      expect(run.result.deployment.metrics).toEqual({ rank: [74] })
    })

    it(`does not read the value of a second reaction_cnt with an element that is not a string, placed ${place}`, () => {
      const run = production(withTags(placed(claim, json('["reaction_cnt", "1000", 7]'), place)), claimBundle)
      expect(run.result.decision).toBe('reject')
      expect(run.codes()).toEqual([])
      expect(run.control('metric-policy').status).toBe('fail')
      expect(run.result.deployment.metrics).toEqual({ rank: [74] })
    })
  }

  it('leaves the metric control passing for a reaction_cnt with an extra element, which the proof check fails (guard)', () => {
    const run = production(withTags(placed(claim, ['reaction_cnt', '2', 'x'], 'in place', 'reaction_cnt')), claimBundle)
    expect(run.result.decision).toBe('reject')
    expect(run.codes()).toEqual([])
    expect(run.control('metric-policy')).toMatchObject({ status: 'pass', summary: SATISFIED })
    expect(run.control('proof-threshold').status).toBe('fail')
  })
})

describe('unknown metric names', () => {
  const UNKNOWN: Array<[string, unknown[]]> = [
    ['with no value', ['x_cnt']],
    ['client, with no value', ['client']],
    ['with a value that is not a string', json('["x_cnt", 7]')],
    ['named __proto__, with no value', json('["__proto__"]')],
    ['named constructor, with no value', json('["constructor"]')],
  ]
  for (const [label, tag] of UNKNOWN) {
    for (const place of ['before', 'after'] as const) {
      it(`reports an unknown name ${label}, placed ${place}, under rejectUnknownMetrics`, () => {
        const run = production(withTags(placed(claim, tag, place)), strictBundle)
        expect(run.result.decision).toBe('reject')
        expect(run.codes()).toEqual([`metric.unknown event[0].tags.${tag[0] as string}`])
        expect(run.control('metric-policy')).toMatchObject({ status: 'fail', summary: NOT_SATISFIED })
      })
    }
  }

  it('reports an unknown name with a value, as before (guard)', () => {
    const run = production(withTags([...claim.tags, ['x_cnt', '1']]), strictBundle)
    expect(run.codes()).toEqual(['metric.unknown event[0].tags.x_cnt'])
  })

  it('does not report unknown names without rejectUnknownMetrics (guard)', () => {
    const run = production(withTags([...claim.tags, ['x_cnt']]), claimBundle)
    expect(run.codes()).toEqual([])
  })

  it('reads a tag whose name is not a string as naming no metric (guard)', () => {
    const run = production(withTags([...claim.tags, json('[5, "1"]')]), strictBundle)
    expect(run.result.decision).toBe('reject')
    expect(run.codes()).toEqual([])
    expect(run.control('metric-policy').status).toBe('fail')
  })
})

describe('the admission rank', () => {
  const AUDIENCE = 'relay:wss://relay.example.com'
  const vouchBundle = bundleFor(RELAY_COMMUNITY_ADMISSION_PROFILE, [vouch], { metricPolicies: { rank: { min: 0, max: 100 } } })
  const challenge = createAdmissionChallenge({ applicantPubkey: subjectPubkey, audience: AUDIENCE, expiresAt: NOW + 60, issuedAt: NOW, nonce: 'ab'.repeat(32) })
  const presentation = createAdmissionPresentation(challenge, keys[3].priv, { createdAt: NOW + 1 })
  const admit = (tags: unknown[][]) => verifyAdmissionRequest(
    signEvent(template(vouch, tags), PUBLISHER_KEY), vouchBundle, challenge, presentation,
    { now: NOW + 1, trustedPublishers: [vouchBundle.signer], expectedAudience: AUDIENCE },
  )

  it('admits the vouch as published, at rank 92 (guard)', () => {
    expect(admit(vouch.tags)).toMatchObject({ decision: 'admit', rank: 92, valid: true })
  })

  for (const place of PLACES) {
    for (const value of ['1000', '80']) {
      it(`gives no rank for a vouch with a second rank of ${value}, placed ${place}`, () => {
        expect(admit(placed(vouch, ['rank', value], place))).toMatchObject({ decision: 'deny', rank: null, valid: false })
      })
    }
  }

  it('gives no rank for a vouch whose rank is blank, where it read 0', () => {
    expect(admit(placed(vouch, ['rank', ''], 'in place', 'rank'))).toMatchObject({ decision: 'deny', rank: null })
  })

  it('gives the rank of a vouch that publishes it once, out of bounds, as before (guard)', () => {
    expect(admit(placed(vouch, ['rank', '1000'], 'in place', 'rank'))).toMatchObject({ decision: 'deny', rank: 1000 })
  })
})

describe('in a federation', () => {
  const fedBundle = bundleFor(FEDERATED_MODERATION_PROFILE, moderationEvents, { metricPolicies: { rank: { min: 0, max: 50 } } })

  it('accepts the federation as published, with one rank from each event (guard)', () => {
    const run = production(moderationEvents, fedBundle)
    expect(run.result.decision).toBe('accept')
    expect(run.result.deployment.metrics).toEqual({ rank: [35, 40] })
  })

  for (const place of PLACES) {
    it(`fails the metric control for a second rank above the maximum in the second event, placed ${place}`, () => {
      const second = template(moderationEvents[1], placed(moderationEvents[1], ['rank', '1000'], place))
      const run = production([moderationEvents[0], second], fedBundle)
      expect(run.result.decision).toBe('reject')
      expect(run.codes()).toEqual(['metric.above_max event[1].tags.rank'])
      expect(run.control('metric-policy').status).toBe('fail')
      expect(run.result.deployment.metrics).toEqual({ rank: [35] })
    })
  }
})
