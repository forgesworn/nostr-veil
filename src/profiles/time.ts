/** Reported by a verifier whose `now` cannot be compared. */
export const NOW_INVALID = 'now must be a Unix timestamp'

/** The current time in Unix seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * The time a verifier compares against: the caller's `now`, or the current
 * time when they gave none. `undefined` and `null` both count as none, as they
 * did when each verifier read `options.now ?? nowSeconds()`, and the current
 * time is the one value that cannot switch a time check off.
 *
 * Undefined comes back for any other value no comparison can use. Against NaN,
 * or a word that reads as NaN, every comparison is false, so a bundle would
 * never expire and an assertion would never go stale. The verifier reports
 * {@link NOW_INVALID} and makes no time comparison at all. It does not fall
 * back to the clock for such a value: the caller asked for a particular time
 * and did not get it.
 *
 * A numeric string or a fraction compares as a number, and a caller who passes
 * one already gets a working check, so both are kept and returned as numbers.
 * A string is read as `Number()` reads it, which is how the comparisons read
 * it before, so hex and exponent notation are read as well. The one exception
 * is an empty or blank string: `Number('')` is 0, a time no caller means, so
 * it is an error.
 */
export function verificationTime(value: unknown): number | undefined {
  if (value === undefined || value === null) return nowSeconds()
  const time = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(time) ? time : undefined
}

/**
 * Keep the first {@link NOW_INVALID} and drop the rest. One call passes its
 * `now` to several verifiers, and each reports it for its own part.
 */
export function withoutRepeatedTimeError(errors: readonly string[]): string[] {
  let seen = false
  return errors.filter(error => {
    if (error !== NOW_INVALID) return true
    if (seen) return false
    seen = true
    return true
  })
}

/** The same for issues, which carry the error as their message. */
export function withoutRepeatedTimeIssue<T extends { message: string }>(issues: readonly T[]): T[] {
  let seen = false
  return issues.filter(issue => {
    if (issue.message !== NOW_INVALID) return true
    if (seen) return false
    seen = true
    return true
  })
}
