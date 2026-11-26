/**
 * A record of what kind of failure an error is, kept beside a list of errors
 * and not in it.
 *
 * A verifier's errors are plain strings that quote the event: a tag name, a
 * tag value, a kind. The verifier above files a few of them under an issue
 * code of their own. It cannot tell which from the words, because whoever
 * wrote the event chose some of those words. So the line that raises such an
 * error says what kind it is, here, against the list it is pushed to and its
 * place in that list. The list itself is unchanged, and so is every result.
 *
 * Internal: not exported from the package.
 */
export interface ErrorKinds<Kind extends string> {
  /** Push an error to a list and record its kind. */
  push(errors: string[], message: string, kind: Kind): void
  /** The kind recorded for the error at this place in a list, if it has one. */
  of(errors: readonly string[], index: number): Kind | undefined
}

/** A record for one verifier's errors. Each verifier keeps its own, with its own kinds. */
export function errorKinds<Kind extends string>(): ErrorKinds<Kind> {
  const recorded = new WeakMap<readonly string[], Map<number, { kind: Kind; message: string }>>()

  return {
    push(errors, message, kind) {
      let kinds = recorded.get(errors)
      if (kinds === undefined) {
        kinds = new Map()
        recorded.set(errors, kinds)
      }
      kinds.set(errors.length, { kind, message })
      errors.push(message)
    },
    of(errors, index) {
      const entry = recorded.get(errors)?.get(index)
      // Only for the error it was recorded for, should the list have been changed since
      return entry !== undefined && errors[index] === entry.message ? entry.kind : undefined
    },
  }
}

/**
 * The one kind of syntax error with an issue code of its own: a metric tag
 * whose value is not a number. Every other is a syntax failure and no more.
 */
export type SyntaxErrorKind = 'metric-not-finite'

export const syntaxErrorKinds = errorKinds<SyntaxErrorKind>()
