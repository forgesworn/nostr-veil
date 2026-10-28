import { describe, it, expect, vi } from 'vitest'
import { parseAssertion, parseProviderDeclaration } from '../../src/nip85/parsers.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

const pubkey = 'a'.repeat(64)
const servicePubkey = 'b'.repeat(64)

describe('parseAssertion', () => {
  it('extracts subject from d-tag and metrics from a kind 30382 event', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [
        ['d', pubkey],
        ['p', pubkey],
        ['rank', '85'],
        ['followers', '1200'],
      ],
      content: '',
    }
    const result = parseAssertion(event)
    expect(result.kind).toBe(NIP85_KINDS.USER)
    expect(result.subject).toBe(pubkey)
    expect(result.metrics).toEqual({ rank: '85', followers: '1200' })
  })

  it('returns empty subject when no d-tag present', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['rank', '50']],
      content: '',
    }
    const result = parseAssertion(event)
    expect(result.subject).toBe('')
  })

  it('skips known meta tags: d, p, e, a, k', () => {
    const event = {
      kind: NIP85_KINDS.EVENT,
      tags: [
        ['d', 'someid'],
        ['e', 'someid'],
        ['rank', '70'],
        ['comment_cnt', '5'],
      ],
      content: '',
    }
    const result = parseAssertion(event)
    const metricKeys = Object.keys(result.metrics)
    expect(metricKeys).not.toContain('d')
    expect(metricKeys).not.toContain('e')
    expect(metricKeys).toContain('rank')
    expect(metricKeys).toContain('comment_cnt')
  })

  it('skips tags starting with veil-', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [
        ['d', pubkey],
        ['veil-sig', 'somesig'],
        ['veil-ring', 'ringdata'],
        ['rank', '60'],
      ],
      content: '',
    }
    const result = parseAssertion(event)
    const metricKeys = Object.keys(result.metrics)
    expect(metricKeys).not.toContain('veil-sig')
    expect(metricKeys).not.toContain('veil-ring')
    expect(metricKeys).toContain('rank')
  })

  it('handles event with no tags gracefully', () => {
    const event = { kind: NIP85_KINDS.USER, tags: [], content: '' }
    const result = parseAssertion(event)
    expect(result.subject).toBe('')
    expect(result.metrics).toEqual({})
  })
})

describe('parseProviderDeclaration', () => {
  it('parses compound kind:metric tag names', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [
        ['30382:rank', servicePubkey, 'wss://relay.example.com'],
        ['30382:followers', 'c'.repeat(64), 'wss://relay2.example.com'],
      ],
      content: '',
    }
    const result = parseProviderDeclaration(event)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      kind: 30382,
      metric: 'rank',
      servicePubkey,
      relayHint: 'wss://relay.example.com',
    })
    expect(result[1]).toEqual({
      kind: 30382,
      metric: 'followers',
      servicePubkey: 'c'.repeat(64),
      relayHint: 'wss://relay2.example.com',
    })
  })

  it('skips tags that do not match the kind:metric pattern', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [
        ['notacompound', servicePubkey, 'wss://relay.example.com'],
        ['30382:rank', servicePubkey, 'wss://relay.example.com'],
      ],
      content: '',
    }
    const result = parseProviderDeclaration(event)
    expect(result).toHaveLength(1)
    expect(result[0].metric).toBe('rank')
  })

  it('calls decryptFn when content is non-empty and decryptFn is provided', async () => {
    const decryptedTags = [
      ['30382:rank', servicePubkey, 'wss://relay.example.com'],
    ]
    const decryptFn = vi.fn().mockResolvedValue(JSON.stringify(decryptedTags))
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [],
      content: 'encrypted-payload',
    }
    const result = await parseProviderDeclaration(event, decryptFn)
    expect(decryptFn).toHaveBeenCalledWith('encrypted-payload')
    expect(result).toHaveLength(1)
    expect(result[0].metric).toBe('rank')
  })

  it('does not call decryptFn when content is empty', async () => {
    const decryptFn = vi.fn().mockResolvedValue('[]')
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [['30382:rank', servicePubkey, 'wss://relay.example.com']],
      content: '',
    }
    const result = await parseProviderDeclaration(event, decryptFn)
    expect(decryptFn).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
  })

  it('returns empty array when no compound tags and no content', () => {
    const event = { kind: NIP85_KINDS.PROVIDER, tags: [], content: '' }
    const result = parseProviderDeclaration(event)
    expect(result).toEqual([])
  })
})
