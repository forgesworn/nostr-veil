import { describe, it, expect } from 'vitest'
import { buildUserAssertion, buildProviderDeclaration } from '../../src/nip85/builders.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

describe('buildUserAssertion', () => {
  const pubkey = 'a'.repeat(64)

  it('creates a kind 30382 event with d-tag set to pubkey', () => {
    const event = buildUserAssertion(pubkey, { rank: 85 })
    expect(event.kind).toBe(NIP85_KINDS.USER)
    expect(event.tags).toContainEqual(['d', pubkey])
    expect(event.content).toBe('')
  })

  it('includes metric tags', () => {
    const event = buildUserAssertion(pubkey, { rank: 85, followers: 1200 })
    expect(event.tags).toContainEqual(['rank', '85'])
    expect(event.tags).toContainEqual(['followers', '1200'])
  })

  it('includes string metrics like t (topics)', () => {
    const event = buildUserAssertion(pubkey, { t: 'bitcoin' })
    expect(event.tags).toContainEqual(['t', 'bitcoin'])
  })

  it('omits undefined metrics', () => {
    const event = buildUserAssertion(pubkey, { rank: 50 })
    const tagNames = event.tags.map(t => t[0])
    expect(tagNames).not.toContain('followers')
  })

  it('includes p-tag with pubkey', () => {
    const event = buildUserAssertion(pubkey, { rank: 50 })
    expect(event.tags).toContainEqual(['p', pubkey])
  })
})

describe('buildProviderDeclaration', () => {
  it('creates a kind 10040 event', () => {
    const event = buildProviderDeclaration([
      { kind: 30382, metric: 'rank', servicePubkey: 'b'.repeat(64), relayHint: 'wss://relay.example.com' },
    ])
    expect(event.kind).toBe(NIP85_KINDS.PROVIDER)
  })

  it('uses kind:metric compound tag names', () => {
    const event = buildProviderDeclaration([
      { kind: 30382, metric: 'rank', servicePubkey: 'b'.repeat(64), relayHint: 'wss://relay.example.com' },
      { kind: 30382, metric: 'followers', servicePubkey: 'c'.repeat(64), relayHint: 'wss://relay2.example.com' },
    ])
    expect(event.tags).toContainEqual(['30382:rank', 'b'.repeat(64), 'wss://relay.example.com'])
    expect(event.tags).toContainEqual(['30382:followers', 'c'.repeat(64), 'wss://relay2.example.com'])
  })

  it('supports encrypted content via encryptedContent param', () => {
    const event = buildProviderDeclaration([], 'encrypted-payload')
    expect(event.content).toBe('encrypted-payload')
    expect(event.tags).toEqual([])
  })
})
