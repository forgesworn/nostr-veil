import { describe, it, expect } from 'vitest'
import { createUserPersona } from '../../src/identity/persona.js'

const TEST_NSEC = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw'

describe('createUserPersona', () => {
  it('returns a persona with the correct name', () => {
    const handle = createUserPersona(TEST_NSEC, 'alice')
    expect(handle.persona.name).toBe('alice')
    handle.destroy()
  })

  it('persona has an identity with npub and nsec', () => {
    const handle = createUserPersona(TEST_NSEC, 'alice')
    expect(handle.persona.identity.npub).toMatch(/^npub1/)
    expect(handle.persona.identity.nsec).toMatch(/^nsec1/)
    handle.destroy()
  })

  it('different names produce different identities', () => {
    const handleA = createUserPersona(TEST_NSEC, 'alice')
    const handleB = createUserPersona(TEST_NSEC, 'bob')
    expect(handleA.persona.identity.npub).not.toBe(handleB.persona.identity.npub)
    handleA.destroy()
    handleB.destroy()
  })

  it('destroy() completes without error', () => {
    const handle = createUserPersona(TEST_NSEC, 'alice')
    expect(() => handle.destroy()).not.toThrow()
  })
})
