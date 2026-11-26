import type { VerificationIssue, VerificationIssueCode } from './issues.js'

/**
 * The issues behind each list of errors a collector has handed out, so that a
 * result whose type has only `errors` still gives its codes to the verifier
 * above it. Nothing outside this module can read or change an entry.
 */
const RECORDED = new WeakMap<readonly string[], readonly VerificationIssue[]>()

/**
 * The errors of one verification, each held with the code it was raised with.
 *
 * A code decides which control of the decision report fails and what the
 * operator is told to do. The messages quote text from the event: a tag name,
 * a tag value, a kind. A code read back out of a message can therefore be
 * chosen by whoever wrote the event, by naming a tag after another failure.
 * So a code is never read from a message. It is given here, by the line that
 * raises the error, and there is no way to record an error without one.
 *
 * Internal: not exported from the package.
 */
export class CodedErrors {
  readonly #issues: VerificationIssue[] = []

  /**
   * Record an error under its code. `path` says where in the input the fault
   * is. It is given by the caller too, never read out of the message.
   */
  add(code: VerificationIssueCode, message: string, path?: string): void {
    this.#issues.push(Object.freeze({ code, message, ...(path === undefined ? {} : { path }) }))
  }

  get length(): number {
    return this.#issues.length
  }

  /** The issues recorded so far, in order. */
  get issues(): VerificationIssue[] {
    return [...this.#issues]
  }

  /**
   * Their messages, in the same order: `errors[i]` is `issues[i].message`.
   * The list is the one a result carries as its `errors`, and {@link issuesOf}
   * finds the issues again from it.
   */
  get errors(): string[] {
    const errors = this.#issues.map(issue => issue.message)
    RECORDED.set(errors, this.issues)
    return errors
  }
}

/**
 * The issues of a result, one for each of its errors and in their order.
 *
 * A result made by this library carries them, as `issues` or through the list
 * of errors a {@link CodedErrors} handed out. An error with no issue behind
 * it, such as one in a result built by hand or one added to the list
 * afterwards, gets the general code. No code is guessed from its words.
 */
export function issuesOf(
  result: { errors: readonly string[]; issues?: readonly VerificationIssue[] },
): readonly VerificationIssue[] {
  if (result.issues !== undefined) return result.issues

  const recorded = RECORDED.get(result.errors) ?? []
  return result.errors.map((message, index) => recorded[index]?.message === message
    ? recorded[index]
    : Object.freeze({ code: 'verification.failed' as const, message }))
}
