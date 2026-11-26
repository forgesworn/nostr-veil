import { describe, expect, it } from 'vitest'
import { validateAssertionStrict } from '../../src/nip85/validators.js'
import { NIP85_KINDS } from '../../src/nip85/types.js'

// Strict validation counts every p, e, a and i tag, whatever its value. It
// counted a d tag, and a k tag, only where its value was a string, so a second
// one with no value, or with a value that is not a string, read as no second
// tag at all.

type Assertion = { kind: number, tags: string[][], content: string }
const pubkey = 'a'.repeat(64)
const assertion = (kind: number, d: string) => (...tags: unknown[][]): Assertion => ({
  kind, tags: [['d', d], ['rank', '50'], ...tags] as string[][], content: '',
})
const user = assertion(NIP85_KINDS.USER, pubkey)
const identifier = (...tags: unknown[][]): Assertion => ({
  kind: NIP85_KINDS.IDENTIFIER, tags: [['d', 'https://a.example'], ['k', 'web'], ['rank', '50'], ...tags] as string[][], content: '',
})
// The kinds on which a k tag may appear once, and is not the subject tag
const OTHER_KINDS: Array<[number, (...tags: unknown[][]) => Assertion]> = [
  [NIP85_KINDS.USER, user],
  [NIP85_KINDS.EVENT, assertion(NIP85_KINDS.EVENT, 'b'.repeat(64))],
  [NIP85_KINDS.ADDRESSABLE, assertion(NIP85_KINDS.ADDRESSABLE, `30023:${pubkey}:article`)],
]
const first = <T extends { tags: string[][] }>(event: T, tag: unknown[]): T => ({ ...event, tags: [tag as string[], ...event.tags] })

const SECOND_TAGS: Array<[string, (name: string) => unknown[]]> = [
  ['with no value', name => [name]],
  ['with a value that is not a string', name => [name, 7]],
  ['with a list for its value', name => [name, ['x']]],
]

describe('strict validation of a tag an assertion carries once', () => {
  // Guards, which hold on the parent too
  it.each([...OTHER_KINDS.map(([kind, make]) => [kind, make] as const), [NIP85_KINDS.IDENTIFIER, identifier] as const])(
    'accepts kind %d with one d tag, and one k tag where it has one', (_kind, make) => {
      expect(validateAssertionStrict(make()).errors).toEqual([])
      if (make !== identifier) expect(validateAssertionStrict(make(['k', 'web'])).errors).toEqual([])
    })

  it('reports a second d or k tag whose value is a string', () => {
    expect(validateAssertionStrict(user(['d', 'b'.repeat(64)])).errors).toContain('Duplicate d-tag.')
    expect(validateAssertionStrict(identifier(['k', 'isbn'])).errors).toContain('Duplicate k-tag.')
  })

  // A guard, which holds on the parent too: beside no d or k tag that has a
  // string value, the tag is missing, and that is all that is said
  it('reads two d tags with no value, or two k tags on kind 30385, as missing', () => {
    expect(validateAssertionStrict({ ...user(), tags: [['d'], ['d', 7], ['rank', '50']] as string[][] }).errors).toEqual(['Missing required d-tag.'])
    expect(validateAssertionStrict({ ...identifier(), tags: [['d', 'https://a.example'], ['k'], ['k', 7], ['rank', '50']] as string[][] }).errors)
      .toEqual(['Missing required k-tag.'])
  })

  it.each(SECOND_TAGS)('reports a second d tag %s, once, after the first or before it', (_label, tag) => {
    expect(validateAssertionStrict(user(tag('d'))).errors).toEqual(['Duplicate d-tag.'])
    expect(validateAssertionStrict(first(user(), tag('d'))).errors).toEqual(['Duplicate d-tag.'])
  })

  it.each(SECOND_TAGS)('reports a second k tag %s on kind 30385, once, after the first or before it', (_label, tag) => {
    expect(validateAssertionStrict(identifier(tag('k'))).errors).toEqual(['Duplicate k-tag.'])
    expect(validateAssertionStrict(first(identifier(), tag('k'))).errors).toEqual(['Duplicate k-tag.'])
  })

  describe.each(OTHER_KINDS)('on kind %d', (_kind, make) => {
    it.each(SECOND_TAGS)('reports a second k tag %s, once', (_label, tag) => {
      expect(validateAssertionStrict(make(['k', 'web'], tag('k'))).errors).toEqual(['Duplicate k-tag.'])
      expect(validateAssertionStrict(first(make(['k', 'web']), tag('k'))).errors).toEqual(['Duplicate k-tag.'])
    })

    // A k tag is not required here, so two with no value are two k tags, not a missing one
    it('reports two k tags with no value as a duplicate', () => {
      expect(validateAssertionStrict(make(['k'], ['k'])).errors).toEqual(['Duplicate k-tag.'])
    })
  })
})
