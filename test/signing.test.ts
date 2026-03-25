import { describe, it, expect } from 'vitest'
import { computeEventId, signEvent } from '../src/signing.js'

describe('computeEventId', () => {
  it('produces a 64-char lowercase hex string', () => {
    const template = {
      kind: 30382,
      tags: [['d', 'abc123']],
      content: '',
      created_at: 1700000000,
      pubkey: 'a'.repeat(64),
    }
    const id = computeEventId(template)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', () => {
    const template = {
      kind: 30382,
      tags: [['d', 'abc123']],
      content: '',
      created_at: 1700000000,
      pubkey: 'a'.repeat(64),
    }
    expect(computeEventId(template)).toBe(computeEventId(template))
  })
})

describe('signEvent', () => {
  it('returns a signed event with id, pubkey, and sig fields', () => {
    const template = {
      kind: 1,
      tags: [],
      content: 'hello',
    }
    const privateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const signed = signEvent(template, privateKey)

    expect(signed.id).toMatch(/^[0-9a-f]{64}$/)
    expect(signed.pubkey).toMatch(/^[0-9a-f]{64}$/)
    expect(signed.sig).toMatch(/^[0-9a-f]{128}$/)
    expect(signed.kind).toBe(1)
    expect(signed.content).toBe('hello')
    expect(signed.tags).toEqual([])
    expect(typeof signed.created_at).toBe('number')
  })

  it('produces a valid BIP-340 signature', async () => {
    const { schnorr } = await import('@noble/curves/secp256k1')
    const privateKey = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    const template = { kind: 1, tags: [], content: 'test' }
    const signed = signEvent(template, privateKey)

    const valid = schnorr.verify(signed.sig, signed.id, signed.pubkey)
    expect(valid).toBe(true)
  })
})
