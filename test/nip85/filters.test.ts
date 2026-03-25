import { describe, it, expect } from 'vitest'
import { assertionFilter, providerFilter } from '../../src/nip85/filters.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

const pubkey = 'a'.repeat(64)

describe('assertionFilter', () => {
  it('creates a filter with the specified kind', () => {
    const filter = assertionFilter({ kind: NIP85_KINDS.USER })
    expect(filter.kinds).toContain(NIP85_KINDS.USER)
  })

  it('includes #d filter when subject is specified', () => {
    const filter = assertionFilter({ kind: NIP85_KINDS.USER, subject: pubkey })
    expect(filter['#d']).toEqual([pubkey])
  })

  it('does not include #d when subject is not specified', () => {
    const filter = assertionFilter({ kind: NIP85_KINDS.USER })
    expect(filter['#d']).toBeUndefined()
  })

  it('includes authors when provider pubkey is specified', () => {
    const filter = assertionFilter({ kind: NIP85_KINDS.USER, provider: pubkey })
    expect(filter.authors).toEqual([pubkey])
  })

  it('does not include authors when provider is not specified', () => {
    const filter = assertionFilter({ kind: NIP85_KINDS.USER })
    expect(filter.authors).toBeUndefined()
  })

  it('combines subject and provider filters', () => {
    const subject = 'a'.repeat(64)
    const provider = 'b'.repeat(64)
    const filter = assertionFilter({ kind: NIP85_KINDS.EVENT, subject, provider })
    expect(filter.kinds).toContain(NIP85_KINDS.EVENT)
    expect(filter['#d']).toEqual([subject])
    expect(filter.authors).toEqual([provider])
  })

  it('wraps the kind in an array', () => {
    const filter = assertionFilter({ kind: NIP85_KINDS.ADDRESSABLE })
    expect(Array.isArray(filter.kinds)).toBe(true)
    expect(filter.kinds).toHaveLength(1)
  })
})

describe('providerFilter', () => {
  it('creates a kind 10040 filter', () => {
    const filter = providerFilter(pubkey)
    expect(filter.kinds).toContain(NIP85_KINDS.PROVIDER)
  })

  it('includes the pubkey in authors', () => {
    const filter = providerFilter(pubkey)
    expect(filter.authors).toEqual([pubkey])
  })

  it('returns a filter with kinds array of length 1', () => {
    const filter = providerFilter(pubkey)
    expect(filter.kinds).toHaveLength(1)
  })
})
