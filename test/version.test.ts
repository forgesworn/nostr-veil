import { describe, it, expect } from 'vitest'
import { VERSION } from 'nostr-veil'

describe('nostr-veil', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0')
  })
})
