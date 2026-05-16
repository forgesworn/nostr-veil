import { describe, it, expect } from 'vitest'
import { createTrustCircle, computeCircleId, canonicalMessage, electionId, MAX_SCOPE_LENGTH } from '../../src/proof/circle.js'

describe('createTrustCircle', () => {
  const pubkeys = ['b'.repeat(64), 'a'.repeat(64), 'c'.repeat(64)]

  it('sorts members alphabetically', () => {
    const circle = createTrustCircle(pubkeys)
    expect(circle.members[0]).toBe('a'.repeat(64))
    expect(circle.members[1]).toBe('b'.repeat(64))
    expect(circle.members[2]).toBe('c'.repeat(64))
  })

  it('computes a deterministic circleId', () => {
    const c1 = createTrustCircle(pubkeys)
    const c2 = createTrustCircle([...pubkeys].reverse())
    expect(c1.circleId).toBe(c2.circleId)
  })

  it('sets size correctly', () => {
    expect(createTrustCircle(pubkeys).size).toBe(3)
  })

  it('rejects duplicate pubkeys', () => {
    expect(() => createTrustCircle(['a'.repeat(64), 'a'.repeat(64)])).toThrow()
  })

  it('rejects fewer than 2 members', () => {
    expect(() => createTrustCircle(['a'.repeat(64)])).toThrow()
  })

  it('omits scope by default', () => {
    expect(createTrustCircle(pubkeys).scope).toBeUndefined()
  })

  it('accepts an optional federation scope', () => {
    expect(createTrustCircle(pubkeys, { scope: 'reviewers-2026' }).scope).toBe('reviewers-2026')
  })

  it('rejects an empty scope', () => {
    expect(() => createTrustCircle(pubkeys, { scope: '' })).toThrow(/non-empty/)
  })

  it('rejects a scope longer than the maximum', () => {
    expect(() => createTrustCircle(pubkeys, { scope: 'x'.repeat(MAX_SCOPE_LENGTH + 1) })).toThrow(/maximum length/)
  })

  it('rejects a scope that is not a lowercase slug', () => {
    expect(() => createTrustCircle(pubkeys, { scope: 'Not A Slug' })).toThrow(/slug/)
    expect(() => createTrustCircle(pubkeys, { scope: 'has:colon' })).toThrow(/slug/)
  })
})

describe('computeCircleId', () => {
  it('produces a 64-char hex string', () => {
    const id = computeCircleId(['a'.repeat(64), 'b'.repeat(64)])
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('canonicalMessage', () => {
  it('produces deterministic JSON with sorted keys', () => {
    const msg1 = canonicalMessage('circle123', 'subject456', { rank: 85, followers: 100 })
    const msg2 = canonicalMessage('circle123', 'subject456', { followers: 100, rank: 85 })
    expect(msg1).toBe(msg2)
  })

  it('has alphabetically sorted top-level and metric keys', () => {
    const msg = canonicalMessage('cid', 'sub', { rank: 85, followers: 100 })
    const parsed = JSON.parse(msg)
    expect(Object.keys(parsed)).toEqual(['circleId', 'metrics', 'subject'])
    expect(Object.keys(parsed.metrics)).toEqual(['followers', 'rank'])
  })

  it('rejects NaN metric values', () => {
    expect(() => canonicalMessage('cid', 'sub', { rank: NaN })).toThrow(/finite/)
  })

  it('rejects Infinity metric values', () => {
    expect(() => canonicalMessage('cid', 'sub', { rank: Infinity })).toThrow(/finite/)
  })

  it('rejects -Infinity metric values', () => {
    expect(() => canonicalMessage('cid', 'sub', { rank: -Infinity })).toThrow(/finite/)
  })
})

describe('electionId', () => {
  it('builds a versioned election id from scope and subject', () => {
    expect(electionId('reviewers-2026', 'abc')).toBe('veil:v1:reviewers-2026:abc')
  })

  it('differs when the scope differs', () => {
    expect(electionId('circle-a', 'subj')).not.toBe(electionId('circle-b', 'subj'))
  })
})
