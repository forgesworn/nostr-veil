import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { useCaseResults } from '../../examples/use-cases/_all.js'
import type { UseCaseResult } from '../../examples/use-cases/_shared.js'
import {
  NIP85_KINDS,
  USE_CASE_PROFILE_BY_ID,
  computeCircleId,
  computeEventId,
  signEvent,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { EventTemplate, SignedEvent } from '../../src/index.js'
import type { UseCaseProfile, VerifyUseCaseProfileOptions } from '../../src/profiles/index.js'

const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])
const RELAY_PUBLISHER_KEY = '55'.repeat(32)

function isAssertionResult(result: UseCaseResult): result is UseCaseResult & { assertion: EventTemplate } {
  return 'assertion' in result
}

function eventsFor(result: UseCaseResult): EventTemplate[] {
  return isAssertionResult(result) ? [result.assertion] : result.events
}

function cloneEvent(event: EventTemplate): EventTemplate {
  return {
    kind: event.kind,
    tags: event.tags.map(tag => [...tag]),
    content: event.content,
    ...(event.created_at === undefined ? {} : { created_at: event.created_at }),
  }
}

function cloneEvents(result: UseCaseResult): EventTemplate[] {
  return eventsFor(result).map(cloneEvent)
}

function tagValue(event: EventTemplate, name: string): string | undefined {
  return event.tags.find(tag => tag[0] === name)?.[1]
}

function circleId(event: EventTemplate): string {
  const ring = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (ring === undefined) throw new Error('missing veil-ring tag')
  return computeCircleId(ring)
}

function firstMetricTagIndex(event: EventTemplate): number {
  const index = event.tags.findIndex(tag => !META_TAGS.has(tag[0]) && !tag[0].startsWith('veil-'))
  if (index === -1) throw new Error('event has no published metric tag')
  return index
}

function replaceFirstTagValue(event: EventTemplate, name: string, value: string): void {
  const tag = event.tags.find(candidate => candidate[0] === name)
  if (tag === undefined) throw new Error(`missing ${name} tag`)
  tag[1] = value
}

function differentHex64(value: string | undefined): string {
  const candidate = 'f'.repeat(64)
  return value === candidate ? 'e'.repeat(64) : candidate
}

function differentAddress(value: string): string {
  const [kind = '30023', pubkey, ...rest] = value.split(':')
  return `${kind}:${differentHex64(pubkey)}:${rest.join(':') || 'changed'}`
}

function differentSubject(value: string): string {
  if (/^[0-9a-f]{64}$/.test(value)) return differentHex64(value)
  if (/^(0|[1-9]\d*):[0-9a-f]{64}:/.test(value)) return differentAddress(value)
  return `${value}:tampered`
}

function differentSubjectHintValue(tagName: string, value: string): string {
  switch (tagName) {
    case 'p':
    case 'e':
      return differentHex64(value)
    case 'a':
      return differentAddress(value)
    case 'k':
      return value === '0' ? '1' : '0'
    default:
      throw new Error(`unsupported subject hint tag ${tagName}`)
  }
}

function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(value, (_key, child: unknown) => {
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(child as Record<string, unknown>).sort()) {
        sorted[key] = (child as Record<string, unknown>)[key]
      }
      return sorted
    }
    return child
  })
}

function profileFor(result: UseCaseResult): UseCaseProfile {
  const profile = USE_CASE_PROFILE_BY_ID[result.slug]
  if (profile === undefined) throw new Error(`missing use-case profile for ${result.slug}`)
  return profile
}

function nowFor(result: UseCaseResult): number {
  return Math.max(...eventsFor(result).map(event => event.created_at ?? 0))
}

function acceptedCircleIdsFor(result: UseCaseResult): string[] {
  return eventsFor(result).map(circleId)
}

function verifyDeployment(
  result: UseCaseResult,
  events: EventTemplate[],
  options: VerifyUseCaseProfileOptions = {},
) {
  return verifyUseCaseProfile(events, profileFor(result), {
    acceptedCircleIds: acceptedCircleIdsFor(result),
    now: nowFor(result),
    ...options,
  })
}

function tamperPublishedMetric(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  const metricIndex = firstMetricTagIndex(tampered[0])
  const current = tampered[0].tags[metricIndex][1]
  tampered[0].tags[metricIndex][1] = current === '99' ? '98' : '99'
  return tampered
}

function useWrongSubject(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  const subject = tagValue(tampered[0], 'd')
  if (subject === undefined) throw new Error('missing d tag')
  replaceFirstTagValue(tampered[0], 'd', differentSubject(subject))
  return tampered
}

function useWrongSubjectHint(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  const hint = tampered[0].tags.find(tag => ['p', 'e', 'a', 'k'].includes(tag[0]))
  if (hint === undefined || hint[1] === undefined) throw new Error('missing subject hint tag')
  hint[1] = differentSubjectHintValue(hint[0], hint[1])
  return tampered
}

function useWrongKind(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  tampered[0].kind = tampered[0].kind === NIP85_KINDS.IDENTIFIER
    ? NIP85_KINDS.USER
    : NIP85_KINDS.IDENTIFIER
  return tampered
}

function downgradeSignedProofPayload(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  const signatureTag = tampered[0].tags.find(tag => tag[0] === 'veil-sig')
  if (signatureTag === undefined || signatureTag[1] === undefined) {
    throw new Error('missing veil-sig tag')
  }

  const payload = JSON.parse(signatureTag[1]) as Record<string, unknown>
  const message = JSON.parse(String(payload.message)) as {
    circleId: string
    metrics: Record<string, number>
    subject: string
  }

  payload.message = stableStringify({
    circleId: message.circleId,
    metrics: message.metrics,
    subject: message.subject,
  })
  signatureTag[1] = JSON.stringify(payload)
  return tampered
}

function duplicateSigner(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  const signatureIndexes = tampered[0].tags
    .map((tag, index) => tag[0] === 'veil-sig' ? index : -1)
    .filter(index => index !== -1)
  if (signatureIndexes.length < 2) throw new Error('need at least two signatures')
  tampered[0].tags[signatureIndexes[1]] = [...tampered[0].tags[signatureIndexes[0]]]
  return tampered
}

function removeSigner(events: EventTemplate[]): EventTemplate[] {
  const tampered = events.map(cloneEvent)
  const signatureIndex = tampered[0].tags.findIndex(tag => tag[0] === 'veil-sig')
  if (signatureIndex === -1) throw new Error('missing veil-sig tag')
  tampered[0].tags.splice(signatureIndex, 1)
  return tampered
}

function staleEvents(result: UseCaseResult): EventTemplate[] {
  const profile = profileFor(result)
  return cloneEvents(result).map(event => ({ ...event, created_at: nowFor(result) - profile.maxAgeSeconds - 1 }))
}

function signedEventIsValid(event: SignedEvent): boolean {
  if (computeEventId(event) !== event.id) return false
  try {
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey))
  } catch {
    return false
  }
}

function cloneSignedEvent(event: SignedEvent): SignedEvent {
  return {
    ...event,
    tags: event.tags.map(tag => [...tag]),
  }
}

describe('adversarial use-case deployment checks', () => {
  it('accepts each canonical use-case under its deployment policy', { timeout: 30_000 }, () => {
    for (const result of useCaseResults) {
      const deployment = verifyDeployment(result, cloneEvents(result))

      expect(deployment.valid, `${result.slug}: ${deployment.errors.join('; ')}`).toBe(true)
    }
  })

  it('rejects cryptographic and subject-binding tampering for every use case', { timeout: 30_000 }, () => {
    const attacks = [
      ['tampered metric', tamperPublishedMetric],
      ['wrong d-tag subject', useWrongSubject],
      ['wrong subject hint tag', useWrongSubjectHint],
      ['wrong assertion kind', useWrongKind],
      ['downgraded signed proof payload', downgradeSignedProofPayload],
      ['duplicate signer key image', duplicateSigner],
      ['insufficient signer threshold', removeSigner],
    ] as const

    for (const result of useCaseResults) {
      for (const [name, attack] of attacks) {
        const deployment = verifyDeployment(result, attack(eventsFor(result)))

        expect(deployment.valid, `${result.slug} accepted ${name}`).toBe(false)
      }
    }
  })

  it('rejects stale assertions and otherwise-valid proofs from unknown circles', { timeout: 30_000 }, () => {
    for (const result of useCaseResults) {
      const stale = verifyDeployment(result, staleEvents(result))
      const unknownCircle = verifyDeployment(result, cloneEvents(result), {
        acceptedCircleIds: ['0'.repeat(64)],
      })

      expect(stale.valid, `${result.slug} accepted a stale assertion`).toBe(false)
      expect(stale.errors.join('; '), result.slug).toContain('freshness window')
      expect(unknownCircle.valid, `${result.slug} accepted an unknown circle`).toBe(false)
      expect(unknownCircle.errors.join('; '), result.slug).toContain('circle is not accepted')
    }
  })

  it('detects relay-returned content or tag mutation with the Nostr event signature', () => {
    for (const result of useCaseResults) {
      for (const [index, event] of eventsFor(result).entries()) {
        const signed = signEvent(event, RELAY_PUBLISHER_KEY)
        const contentTampered = { ...signed, content: `${signed.content}tampered` }
        const tagTampered = cloneSignedEvent(signed)
        const metricIndex = firstMetricTagIndex(tagTampered)

        tagTampered.tags[metricIndex][1] = tagTampered.tags[metricIndex][1] === '99' ? '98' : '99'

        expect(signedEventIsValid(signed), `${result.slug}[${index}] signed event rejected`).toBe(true)
        expect(signedEventIsValid(contentTampered), `${result.slug}[${index}] content tamper accepted`).toBe(false)
        expect(signedEventIsValid(tagTampered), `${result.slug}[${index}] tag tamper accepted`).toBe(false)
      }
    }
  })
})
