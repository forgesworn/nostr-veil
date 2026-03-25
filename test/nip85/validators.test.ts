import { describe, it, expect } from 'vitest'
import { validateAssertion } from '../../src/nip85/validators.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

const pubkey = 'a'.repeat(64)

describe('validateAssertion', () => {
  it('passes for a valid kind 30382 event with d-tag', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey]],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('passes for valid kind 30383', () => {
    const event = {
      kind: NIP85_KINDS.EVENT,
      tags: [['d', 'eventid']],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(true)
  })

  it('passes for valid kind 30384', () => {
    const event = {
      kind: NIP85_KINDS.ADDRESSABLE,
      tags: [['d', 'addr']],
      content: '',
    }
    expect(validateAssertion(event).valid).toBe(true)
  })

  it('passes for valid kind 30385', () => {
    const event = {
      kind: NIP85_KINDS.IDENTIFIER,
      tags: [['d', 'ident']],
      content: '',
    }
    expect(validateAssertion(event).valid).toBe(true)
  })

  it('passes when rank is exactly 0', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '0']],
      content: '',
    }
    expect(validateAssertion(event).valid).toBe(true)
  })

  it('passes when rank is exactly 100', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '100']],
      content: '',
    }
    expect(validateAssertion(event).valid).toBe(true)
  })

  it('fails for an invalid kind (10040 is provider, not assertion)', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [['d', pubkey]],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('kind'))).toBe(true)
  })

  it('fails for a completely unknown kind', () => {
    const event = { kind: 1, tags: [['d', pubkey]], content: '' }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
  })

  it('fails when d-tag is missing', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['rank', '50']],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('d'))).toBe(true)
  })

  it('fails when rank is below 0', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '-1']],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('rank'))).toBe(true)
  })

  it('fails when rank is above 100', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '101']],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('rank'))).toBe(true)
  })

  it('fails when rank is not a number', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', 'high']],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
  })

  it('accumulates multiple errors', () => {
    const event = {
      kind: 1,
      tags: [['rank', '200']],
      content: '',
    }
    const result = validateAssertion(event)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})
