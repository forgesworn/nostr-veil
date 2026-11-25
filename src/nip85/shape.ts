/**
 * The part of an event's shape that every reader depends on. An event arrives
 * from a relay as JSON, so it can be anything: no tags, tags that are not a
 * list, a tag that is not a list, a tag whose name is a number. Code that reads
 * `event.tags` or calls a string method on a tag name without looking would
 * throw on such an event where it should turn it away.
 *
 * This is the one definition of well formed. Each layer consults it before its
 * own reads. It is internal: not exported from the package.
 */

/** Reported for an event that is not an object, or whose tags are not a list. */
export const MALFORMED_EVENT = 'Malformed event: tags must be an array.'

/** Reported for a tag that is not a list, or whose first element, its name, is not a string. */
export const MALFORMED_TAG = 'Malformed tag: every tag must be an array whose name is a string.'

/** A tag is well formed when it is a list whose first element, its name, is a string. */
export function isWellFormedTag(tag: unknown): tag is string[] {
  return Array.isArray(tag) && typeof tag[0] === 'string'
}

/**
 * Say what is wrong with an event's shape, or return `undefined` when every
 * reader can use it as it stands.
 */
export function eventShapeProblem(event: unknown): typeof MALFORMED_EVENT | typeof MALFORMED_TAG | undefined {
  if (event === null || typeof event !== 'object') return MALFORMED_EVENT
  const tags: unknown = (event as { tags?: unknown }).tags
  if (!Array.isArray(tags)) return MALFORMED_EVENT
  return tags.every(isWellFormedTag) ? undefined : MALFORMED_TAG
}

/**
 * The event with only its well-formed tags, for code that reads tags after the
 * shape has been reported. An event that is not an object, or has no list of
 * tags, reads as one with no tags. A well-formed event comes back as it is.
 */
export function readableEvent<T extends { tags: string[][] }>(event: T): T {
  if (event === null || typeof event !== 'object') return { tags: [] } as unknown as T
  const tags: unknown = event.tags
  if (!Array.isArray(tags)) return { ...event, tags: [] }
  return tags.every(isWellFormedTag) ? event : { ...event, tags: tags.filter(isWellFormedTag) }
}
