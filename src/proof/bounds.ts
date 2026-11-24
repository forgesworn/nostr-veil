import type { ContributionBounds } from './types.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Describe what is wrong with the bound for one metric, or return `undefined`
 * when it is well formed.
 *
 * @param bound - The value to check
 * @param label - Name used in the message, for example `contributionBounds.rank`
 */
export function contributionBoundProblem(bound: unknown, label: string): string | undefined {
  if (!isPlainObject(bound)) return `${label} must be an object with min, max or integer`

  const { min, max, integer } = bound
  if (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) {
    return `${label}.min must be a finite number`
  }
  if (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) {
    return `${label}.max must be a finite number`
  }
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    return `${label}.min must be <= max`
  }
  if (integer !== undefined && typeof integer !== 'boolean') {
    return `${label}.integer must be a boolean`
  }

  return undefined
}

/**
 * Describe what is wrong with a set of contribution bounds, or return
 * `undefined` when they are well formed.
 *
 * Bounds arrive from deployment policy and signed bundles as well as from
 * code, so they are checked before use and a malformed set fails closed.
 *
 * @param bounds - The value to check
 * @param label - Name used in the message, for example `policy.contributionBounds`
 */
export function contributionBoundsProblem(bounds: unknown, label = 'contributionBounds'): string | undefined {
  if (!isPlainObject(bounds)) return `${label} must be an object keyed by metric name`

  for (const [name, bound] of Object.entries(bounds)) {
    if (name.trim() === '') return `${label} metric name must be non-empty`
    const problem = contributionBoundProblem(bound, `${label}.${name}`)
    if (problem !== undefined) return problem
  }

  return undefined
}

/**
 * List how one contribution's metrics break the given bounds. An empty array
 * means the contribution is inside them.
 *
 * `aggregateContributions` and `verifyProof` apply this to every contribution
 * when `contributionBounds` is set. An aggregator can call it directly to drop
 * a bad contribution before it aggregates the rest.
 *
 * @param metrics - The metrics of one contribution
 * @param bounds - Well-formed bounds; see {@link contributionBoundsProblem}
 *
 * @example
 * contributionBoundViolations({ rank: 3 }, { rank: { min: 0, max: 1, integer: true } })
 * // ['metric "rank" value 3 is above the contribution maximum 1']
 */
export function contributionBoundViolations(
  metrics: Readonly<Record<string, number>>,
  bounds: ContributionBounds,
): string[] {
  const violations: string[] = []

  for (const [name, value] of Object.entries(metrics)) {
    if (!Object.hasOwn(bounds, name)) continue
    const bound = bounds[name]

    if (bound.min !== undefined && value < bound.min) {
      violations.push(`metric "${name}" value ${value} is below the contribution minimum ${bound.min}`)
    }
    if (bound.max !== undefined && value > bound.max) {
      violations.push(`metric "${name}" value ${value} is above the contribution maximum ${bound.max}`)
    }
    if (bound.integer === true && !Number.isInteger(value)) {
      violations.push(`metric "${name}" value ${value} is not an integer, as the contribution bounds require`)
    }
  }

  return violations
}
