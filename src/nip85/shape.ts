/**
 * What can safely be done with a value that came from outside. An event
 * arrives from a relay as JSON, so it can be anything: no tags, tags that are
 * not a list, a tag that is not a list, a tag whose name is a number, a value
 * that is an object where a string belongs. Three things go wrong when code
 * uses such a value without looking:
 *
 * - reading a property of it throws when it is `null`;
 * - calling a string or list method on it throws when it is something else;
 * - turning it into a string or a number throws when it is an object whose
 *   `toString` is not a function, which JSON can carry (`{"toString":1}`), and
 *   overflows the stack when it is a list nested thousands deep. A template, a
 *   comparison with `<`, `Number()`, `String()` and `RegExp.test()` all do
 *   that conversion.
 *
 * This is the one definition of what is safe to read. Each layer consults it
 * before its own reads. It is internal: not exported from the package.
 */

/** Reported for an event that is not an object, or whose tags are not a list. */
export const MALFORMED_EVENT = 'Malformed event: tags must be an array.'

/** Reported for a tag that is not a list, or whose first element, its name, is not a string. */
export const MALFORMED_TAG = 'Malformed tag: every tag must be an array whose name is a string.'

/** A tag is well formed when it is a list whose first element, its name, is a string. */
export function isWellFormedTag(tag: unknown): tag is [string, ...unknown[]] {
  return Array.isArray(tag) && typeof tag[0] === 'string'
}

/** A tag is readable when it is a non-empty list of strings, which is all NIP-01 allows it to be. */
export function isReadableTag(tag: unknown): tag is string[] {
  return Array.isArray(tag) && tag.length > 0 && tag.every(element => typeof element === 'string')
}

/**
 * The event with only its readable tags, for code that reads tag names and
 * values after the syntax check has reported the rest. An event that is not an
 * object, or has no list of tags, reads as one with no tags. An event whose
 * tags are all readable comes back as it is.
 */
export function readableEvent<T extends { tags: string[][] }>(event: T): T {
  if (event === null || typeof event !== 'object') return { tags: [] } as unknown as T
  const tags: unknown = event.tags
  if (!Array.isArray(tags)) return { ...event, tags: [] }
  return tags.every(isReadableTag) ? event : { ...event, tags: tags.filter(isReadableTag) }
}

/** True when nothing was left out of {@link readableEvent}: the event is an object and every tag is readable. */
export function isFullyReadable(event: unknown): boolean {
  if (event === null || typeof event !== 'object') return false
  const tags: unknown = (event as { tags?: unknown }).tags
  return Array.isArray(tags) && tags.every(isReadableTag)
}

/**
 * A value for an error message. A template would convert it to a string, which
 * throws or overflows on the objects described above, so an object is named by
 * what it is and never converted. A plain object reads as it always did in
 * these messages.
 */
export function shown(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value)
  return Array.isArray(value) ? '[list]' : '[object Object]'
}

/**
 * The number a value stands for, or `NaN`. `Number()` converts an object
 * through its `toString`, with the same two hazards, and reads a one-element
 * list as its element; an object is no number at all.
 */
export function numberFrom(value: unknown): number {
  return value !== null && typeof value === 'object' ? Number.NaN : Number(value)
}

/** Test a pattern against a value only when it is a string. `RegExp.test` converts anything else first. */
export function matches(pattern: RegExp, value: unknown): value is string {
  return typeof value === 'string' && pattern.test(value)
}
