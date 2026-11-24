import { describe, expect, it } from 'vitest'
import { contributionBoundViolations, contributionBoundsProblem } from '../../src/proof/bounds.js'

describe('contributionBoundViolations', () => {
  const ballot = { rank: { min: 0, max: 1, integer: true } }

  it('returns nothing for values inside the bounds', () => {
    expect(contributionBoundViolations({ rank: 0 }, ballot)).toEqual([])
    expect(contributionBoundViolations({ rank: 1 }, ballot)).toEqual([])
  })

  it('names each violation', () => {
    expect(contributionBoundViolations({ rank: 3 }, ballot))
      .toEqual(['metric "rank" value 3 is above the contribution maximum 1'])
    expect(contributionBoundViolations({ rank: -1 }, ballot))
      .toEqual(['metric "rank" value -1 is below the contribution minimum 0'])
    expect(contributionBoundViolations({ rank: 0.5 }, ballot))
      .toEqual(['metric "rank" value 0.5 is not an integer, as the contribution bounds require'])
  })

  it('ignores metrics that have no bound, and bounds for metrics that are absent', () => {
    expect(contributionBoundViolations({ comment_cnt: 9 }, ballot)).toEqual([])
    expect(contributionBoundViolations({ rank: 1, comment_cnt: 9 }, ballot)).toEqual([])
  })

  it('does not read a bound from the prototype chain', () => {
    expect(contributionBoundViolations({ toString: 5 }, ballot)).toEqual([])
  })
})

describe('contributionBoundsProblem', () => {
  it('accepts well-formed bounds', () => {
    expect(contributionBoundsProblem({})).toBeUndefined()
    expect(contributionBoundsProblem({ rank: { min: 0, max: 100 } })).toBeUndefined()
    expect(contributionBoundsProblem({ rank: { integer: true } })).toBeUndefined()
    expect(contributionBoundsProblem({ rank: { min: 1, max: 1 } })).toBeUndefined()
  })

  it('describes what is wrong with malformed bounds', () => {
    expect(contributionBoundsProblem('rank')).toBe('contributionBounds must be an object keyed by metric name')
    expect(contributionBoundsProblem(null)).toBe('contributionBounds must be an object keyed by metric name')
    expect(contributionBoundsProblem([])).toBe('contributionBounds must be an object keyed by metric name')
    expect(contributionBoundsProblem({ '': { min: 0 } })).toBe('contributionBounds metric name must be non-empty')
    expect(contributionBoundsProblem({ rank: 'none' })).toBe('contributionBounds.rank must be an object with min, max or integer')
    expect(contributionBoundsProblem({ rank: { min: Number.NaN } })).toBe('contributionBounds.rank.min must be a finite number')
    expect(contributionBoundsProblem({ rank: { max: Infinity } })).toBe('contributionBounds.rank.max must be a finite number')
    expect(contributionBoundsProblem({ rank: { min: 2, max: 1 } })).toBe('contributionBounds.rank.min must be <= max')
    expect(contributionBoundsProblem({ rank: { integer: 'yes' } })).toBe('contributionBounds.rank.integer must be a boolean')
  })

  it('uses the label it is given', () => {
    expect(contributionBoundsProblem({ rank: { min: 2, max: 1 } }, 'policy.contributionBounds'))
      .toBe('policy.contributionBounds.rank.min must be <= max')
  })
})
