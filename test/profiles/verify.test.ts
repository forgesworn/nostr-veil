import { describe, expect, it } from 'vitest'
import { useCaseResults } from '../../examples/use-cases/_all.js'
import type { UseCaseResult } from '../../examples/use-cases/_shared.js'
import {
  NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  RELAY_SERVICE_REPUTATION_PROFILE,
  USE_CASE_PROFILE_BY_ID,
  USE_CASE_PROFILES,
  computeCircleId,
  verifyUseCaseProfile,
} from '../../src/index.js'
import type { EventTemplate } from '../../src/index.js'

function isAssertionResult(result: UseCaseResult): result is UseCaseResult & { assertion: EventTemplate } {
  return 'assertion' in result
}

function eventsFor(result: UseCaseResult): EventTemplate[] {
  return isAssertionResult(result) ? [result.assertion] : result.events
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

function profileFor(result: UseCaseResult) {
  const profile = USE_CASE_PROFILE_BY_ID[result.slug]
  if (profile === undefined) throw new Error(`missing profile for ${result.slug}`)
  return profile
}

describe('verifyUseCaseProfile', () => {
  it('defines one built-in profile for each canonical executable use case', () => {
    expect(USE_CASE_PROFILES.map(profile => profile.id)).toEqual(useCaseResults.map(result => result.slug))
  })

  it('accepts every canonical use case when deployment policy supplies accepted circles', { timeout: 30_000 }, () => {
    for (const result of useCaseResults) {
      const events = eventsFor(result)
      const profile = profileFor(result)
      const verification = verifyUseCaseProfile(events, profile, {
        acceptedCircleIds: events.map(circleId),
        now: Math.max(...events.map(event => event.created_at ?? 0)),
      })

      expect(verification.valid, `${result.slug}: ${verification.errors.join('; ')}`).toBe(true)
    }
  })

  it('keeps documented real-world identifier shapes in the safer profiles', () => {
    expect(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE.subjectFormats).toEqual([
      'package',
      'git',
      'maintainer',
    ])
    expect(RELAY_SERVICE_REPUTATION_PROFILE.subjectFormats).toEqual(['relay', 'service'])
    expect(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE.subjectFormats).toEqual([
      'nip05',
      'domain',
      'lnurlp',
      'nip96',
      'service',
    ])
  })

  it('fails closed when accepted circle ids are not supplied', () => {
    const result = useCaseResults[0]
    const profile = profileFor(result)
    const verification = verifyUseCaseProfile(eventsFor(result), profile, {
      now: Math.max(...eventsFor(result).map(event => event.created_at ?? 0)),
    })

    expect(verification.valid).toBe(false)
    expect(verification.errors.join('; ')).toContain('no accepted circle IDs')
  })

  it('rejects events whose subject does not match the expected deployment subject', () => {
    const result = useCaseResults[0]
    const events = eventsFor(result)
    const profile = profileFor(result)
    const verification = verifyUseCaseProfile(events.map(cloneEvent), profile, {
      acceptedCircleIds: events.map(circleId),
      expectedSubject: 'f'.repeat(64),
      now: Math.max(...events.map(event => event.created_at ?? 0)),
    })

    expect(verification.valid).toBe(false)
    expect(verification.errors.join('; ')).toContain('expected subject')
  })
})
