import { describe, expect, it } from 'vitest'
import { withoutTrailingSlashes } from '../../src/profiles/trim.js'

describe('withoutTrailingSlashes', () => {
  it('drops only the slashes at the end of a value', () => {
    for (const [value, trimmed] of [
      ['', ''],
      ['/', ''],
      ['///', ''],
      ['a', 'a'],
      ['a/', 'a'],
      ['/a//b///', '/a//b'],
      ['a-', 'a-'],
      ['a.', 'a.'],
      ['a ', 'a '],
      ['a\\', 'a\\'],
      ['a/ ', 'a/ '],
      [`a${'/'.repeat(100)}`, 'a'],
    ]) {
      expect(withoutTrailingSlashes(value), JSON.stringify(value)).toBe(trimmed)
    }
  })

  it('drops a long run of slashes at the end in time', () => {
    const started = performance.now()
    const trimmed = withoutTrailingSlashes(`a${'/'.repeat(1_000_000)}`)

    expect(performance.now() - started).toBeLessThan(1_000)
    expect(trimmed).toBe('a')
  })
})
