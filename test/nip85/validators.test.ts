import { describe, it, expect } from 'vitest'
import {
  validateAssertion,
  validateAssertionStrict,
  validateProviderDeclarationStrict,
} from '../../src/nip85/validators.js'
import { NIP85_KINDS, describeNip85Kind } from '../../src/nip85/types.js'

const pubkey = 'a'.repeat(64)
const servicePubkey = 'c'.repeat(64)
const eventId = 'b'.repeat(64)
const address = `30023:${pubkey}:article`

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

  it('keeps loose validation backward compatible when strict tags are missing', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '80']],
      content: '',
    }
    expect(validateAssertion(event).valid).toBe(true)
  })

  it('keeps loose rank parsing backward compatible for empty rank values', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '']],
      content: '',
    }
    expect(validateAssertion(event).valid).toBe(true)
    expect(validateAssertion(event, { strict: true }).valid).toBe(false)
  })

  it('strictly validates a user assertion d-tag and matching p-tag', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['p', pubkey], ['rank', '80']],
      content: '',
    }
    expect(validateAssertion(event, { strict: true }).valid).toBe(true)
    expect(validateAssertionStrict(event).valid).toBe(true)
  })

  it('strictly accepts a user assertion without an optional p-tag', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['rank', '80']],
      content: '',
    }
    const result = validateAssertionStrict(event)
    expect(result.valid).toBe(true)
  })

  it('strictly rejects a user assertion with a mismatched p-tag', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['p', 'c'.repeat(64)], ['rank', '80']],
      content: '',
    }
    const result = validateAssertionStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('p-tag'))).toBe(true)
  })

  it('strictly validates an event assertion d-tag and matching e-tag', () => {
    const event = {
      kind: NIP85_KINDS.EVENT,
      tags: [['d', eventId], ['e', eventId], ['rank', '80']],
      content: '',
    }
    expect(validateAssertionStrict(event).valid).toBe(true)
  })

  it('strictly accepts an event assertion without an optional e-tag', () => {
    const event = {
      kind: NIP85_KINDS.EVENT,
      tags: [['d', eventId], ['rank', '80']],
      content: '',
    }
    const result = validateAssertionStrict(event)
    expect(result.valid).toBe(true)
  })

  it('strictly rejects an event assertion with a mismatched e-tag', () => {
    const event = {
      kind: NIP85_KINDS.EVENT,
      tags: [['d', eventId], ['e', 'c'.repeat(64)], ['rank', '80']],
      content: '',
    }
    const result = validateAssertionStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('e-tag'))).toBe(true)
  })

  it('strictly validates addressable and identifier assertions', () => {
    const addressable = {
      kind: NIP85_KINDS.ADDRESSABLE,
      tags: [['d', address], ['a', address], ['rank', '80']],
      content: '',
    }
    const identifier = {
      kind: NIP85_KINDS.IDENTIFIER,
      tags: [['d', 'relay:wss://relay.example.com'], ['k', '10002'], ['rank', '80']],
      content: '',
    }
    expect(validateAssertionStrict(addressable).valid).toBe(true)
    expect(validateAssertionStrict(identifier).valid).toBe(true)
  })

  it('strictly accepts an addressable assertion without an optional a-tag', () => {
    const event = {
      kind: NIP85_KINDS.ADDRESSABLE,
      tags: [['d', address], ['rank', '80']],
      content: '',
    }
    expect(validateAssertionStrict(event).valid).toBe(true)
  })

  it('strictly rejects an addressable assertion with a mismatched a-tag', () => {
    const event = {
      kind: NIP85_KINDS.ADDRESSABLE,
      tags: [['d', address], ['a', `30023:${pubkey}:other`], ['rank', '80']],
      content: '',
    }
    const result = validateAssertionStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('a-tag'))).toBe(true)
  })

  it('strictly rejects duplicate metric tags', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [['d', pubkey], ['p', pubkey], ['rank', '80'], ['rank', '81']],
      content: '',
    }
    const result = validateAssertionStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /duplicate metric/i.test(e))).toBe(true)
  })
})

describe('describeNip85Kind', () => {
  it('explains NIP-85 kind numbers', () => {
    expect(describeNip85Kind(NIP85_KINDS.USER)).toBe('NIP-85 kind 30382: user assertion')
    expect(describeNip85Kind(NIP85_KINDS.IDENTIFIER)).toBe(
      'NIP-85 kind 30385: NIP-73/external identifier assertion',
    )
    expect(describeNip85Kind(1)).toBe('Nostr kind 1')
  })
})

describe('validateProviderDeclarationStrict', () => {
  it('accepts a plaintext provider declaration', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [[`${NIP85_KINDS.USER}:rank`, servicePubkey, 'wss://relay.example.com']],
      content: '',
    }
    const result = validateProviderDeclarationStrict(event)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts an encrypted provider declaration without plaintext tags', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [],
      content: 'nip44-encrypted-payload',
    }
    const result = validateProviderDeclarationStrict(event)
    expect(result.valid).toBe(true)
  })

  it('rejects a non-provider event kind', () => {
    const event = {
      kind: NIP85_KINDS.USER,
      tags: [[`${NIP85_KINDS.USER}:rank`, servicePubkey, 'wss://relay.example.com']],
      content: '',
    }
    const result = validateProviderDeclarationStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /kind/i.test(e))).toBe(true)
  })

  it('rejects malformed provider tag names', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [['rank', servicePubkey, 'wss://relay.example.com']],
      content: '',
    }
    const result = validateProviderDeclarationStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /kind:metric/i.test(e))).toBe(true)
  })

  it('rejects invalid service pubkeys', () => {
    const event = {
      kind: NIP85_KINDS.PROVIDER,
      tags: [[`${NIP85_KINDS.USER}:rank`, 'not-a-pubkey', 'wss://relay.example.com']],
      content: '',
    }
    const result = validateProviderDeclarationStrict(event)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /service pubkey/i.test(e))).toBe(true)
  })
})
