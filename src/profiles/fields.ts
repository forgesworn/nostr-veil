/**
 * The shape of what a verifier reads from a deployment policy, from the
 * use-case profile inside it, and from its circle manifests.
 *
 * A policy inside a signed bundle arrives as JSON, and nothing else checks the
 * type of its fields. A field of the wrong type made a verifier throw, or
 * switched its check off without a word: a revocation list given as `null` was
 * read as no list, a metric gate given as a string as no gate. So each field a
 * verifier reads must be absent or of its type, and `null` is not absent.
 * Absent keeps the default the field always had, and is malformed only where
 * there is none.
 *
 * Only the shape is checked here. A value that already has its own check, such
 * as a time window, the signer threshold, a metric bound or the accepted
 * publishers, keeps it, with its own message and code.
 *
 * The three parts are checked apart, because each has its own verifier and its
 * own issue code: a policy field, a profile field and a manifest field.
 *
 * Internal: not exported from the package.
 */
import { CodedErrors } from './coded.js'
import type { VerificationIssue, VerificationIssueCode } from './issues.js'

/**
 * The codes of a field of the wrong type in a policy, its profile or one of
 * its circle manifests. The verifier stops at such a field, so nothing else
 * in that policy was checked, and nothing else in it is read after.
 */
export const FIELD_CODES: readonly VerificationIssueCode[] = [
  'policy.field_invalid',
  'profile.field_invalid',
  'circle.manifest_field_invalid',
]

/** Whether a run stopped at a field of the wrong type. */
export function stoppedAtField(issues: readonly { code: string }[] | undefined): boolean {
  return (issues ?? []).some(issue => (FIELD_CODES as readonly string[]).includes(issue.code))
}

export interface FieldProblem {
  /** Where the field is, for display only: `circleManifests[0].members`. */
  readonly path: string
  readonly message: string
}

type Fields = Record<string, unknown>

function isObject(value: unknown): value is Fields {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isStringList(value: unknown): boolean {
  if (!isList(value)) return false
  // By index: a sparse list has holes that every() would skip
  for (let index = 0; index < value.length; index++) {
    if (!isString(value[index])) return false
  }
  return true
}

/** Collects the problems of one object, each named by its path. */
class Problems {
  readonly found: FieldProblem[] = []

  constructor(readonly at: string, readonly target: Fields) {}

  private add(path: string, expected: string): void {
    this.found.push({ path, message: `${path} must be ${expected}` })
  }

  private path(key: string): string {
    return this.at === '' ? key : `${this.at}.${key}`
  }

  /** A field that must be present and pass `ok`. */
  required(key: string, ok: (value: unknown) => boolean, expected: string): void {
    if (!ok(this.target[key])) this.add(this.path(key), expected)
  }

  /** A field that may be left out, and must pass `ok` where it is given. */
  optional(key: string, ok: (value: unknown) => boolean, expected: string): void {
    const value = this.target[key]
    if (value !== undefined && !ok(value)) this.add(this.path(key), expected)
  }

  /** Each entry of a list, which must pass `ok`. */
  entries(key: string, ok: (value: unknown) => boolean, expected: string): void {
    const list = this.target[key]
    if (!isList(list)) return
    for (let index = 0; index < list.length; index++) {
      if (!ok(list[index])) this.add(`${this.path(key)}[${index}]`, expected)
    }
  }
}

/**
 * The deployment policy's own fields. The profile in it, and each circle
 * manifest once the manifests are known to be a list, are checked by
 * {@link profileFieldProblems} and {@link manifestFieldProblems}.
 */
export function policyFieldProblems(policy: unknown): FieldProblem[] {
  if (!isObject(policy)) return [{ path: 'policy', message: 'policy must be an object' }]
  const problems = new Problems('', policy)

  // A string is also read as text, in a message or a pattern, and an object
  // that JSON can carry, such as {"toString":1}, cannot be read as text
  problems.optional('acceptedCircleIds', isStringList, 'a list of strings')
  problems.optional('aggregate', isString, 'a string')
  problems.optional('circleManifests', isList, 'a list')
  problems.optional('companionEvidence', isList, 'a list')
  problems.entries('companionEvidence', isObject, 'an object')
  problems.required('expectedSubject', isString, 'a string')
  problems.optional('expectedSubjectTagValue', isString, 'a string')
  problems.required('metricPolicies', isObject, 'an object')
  // Each read as "is it true?", so a word or a number switched the check off
  // or on unasked
  problems.optional('allowSupersededCircleIds', isBoolean, 'true or false')
  problems.optional('rejectUnknownMetrics', isBoolean, 'true or false')
  problems.optional('requireNostrSignature', isBoolean, 'true or false')

  const found = [...problems.found]
  const evidence = policy.companionEvidence
  if (isList(evidence)) {
    for (let index = 0; index < evidence.length; index++) {
      const requirement = evidence[index]
      if (!isObject(requirement)) continue
      const named = new Problems(`companionEvidence[${index}]`, requirement)
      named.required('id', isString, 'a string')
      named.optional('required', isBoolean, 'true or false')
      named.optional('expectedSubject', isString, 'a string')
      found.push(...named.found)
    }
  }
  const metricPolicies = policy.metricPolicies
  if (isObject(metricPolicies)) {
    for (const [name, entry] of Object.entries(metricPolicies)) {
      const at = `metricPolicies.${name}`
      if (!isObject(entry)) {
        found.push({ path: at, message: `${at} must be an object` })
        continue
      }
      const flags = new Problems(at, entry)
      flags.optional('required', isBoolean, 'true or false')
      flags.optional('integer', isBoolean, 'true or false')
      found.push(...flags.found)
    }
  }
  return found
}

function isProofVersion(value: unknown): boolean {
  return value === 'v1' || value === 'v2'
}

function isSubjectTag(value: unknown): boolean {
  return value === 'p' || value === 'e' || value === 'a' || value === 'k'
}

function isNumber(value: unknown): boolean {
  return typeof value === 'number'
}

function isMinCircles(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

/** The fields of a use-case profile that the profile verifier reads. */
export function profileFieldProblems(profile: unknown, at = 'profile'): FieldProblem[] {
  if (!isObject(profile)) return [{ path: at, message: `${at} must be an object` }]
  const problems = new Problems(at, profile)

  problems.required('id', isString, 'a string')
  problems.required('kind', isNumber, 'a number')
  problems.required('proofVersion', isProofVersion, '"v1" or "v2"')
  problems.required('subjectTag', isSubjectTag, '"p", "e", "a" or "k"')
  problems.optional('subjectTagValue', isString, 'a string')
  problems.required('subjectFormats', isStringList, 'a list of strings')
  problems.optional('aggregate', isString, 'a string')
  problems.required('metrics', isList, 'a list')
  problems.entries('metrics', isObject, 'an object')
  problems.optional('federation', isObject, 'an object')

  const found = [...problems.found]
  const metrics = profile.metrics
  if (isList(metrics)) {
    for (let index = 0; index < metrics.length; index++) {
      const metric = metrics[index]
      if (!isObject(metric)) continue
      const named = new Problems(`${at}.metrics[${index}]`, metric)
      named.required('name', isString, 'a string')
      named.optional('contribution', isObject, 'an object')
      found.push(...named.found)
    }
  }
  const federation = profile.federation
  if (isObject(federation)) {
    const circles = new Problems(`${at}.federation`, federation)
    circles.required('minCircles', isMinCircles, 'a positive integer')
    circles.optional('requireScope', isBoolean, 'true or false')
    found.push(...circles.found)
  }
  return found
}

/** The fields of a circle manifest that the manifest verifier reads. */
export function manifestFieldProblems(manifest: unknown, at: string): FieldProblem[] {
  if (!isObject(manifest)) return [{ path: at, message: `${at} must be an object` }]
  const problems = new Problems(at, manifest)

  problems.required('circleId', isString, 'a string')
  problems.required('issuedAt', isNumber, 'a number')
  problems.required('members', isStringList, 'a list of strings')
  problems.required('name', isString, 'a string')
  problems.required('profileIds', isStringList, 'a list of strings')
  problems.required('purpose', isString, 'a string')
  problems.optional('revokedCircleIds', isStringList, 'a list of strings')
  problems.optional('supersedes', isStringList, 'a list of strings')
  return problems.found
}

/**
 * Each field of a policy, of its profile and of its circle manifests that is
 * of the wrong type, under the code of the part it belongs to. The profile is
 * the profile's own concern even where it is missing or not an object, so a
 * profile that is not one reads the same here as given to the profile
 * verifier alone.
 */
export function deploymentFieldIssues(policy: unknown): VerificationIssue[] {
  const found = new CodedErrors()
  for (const problem of policyFieldProblems(policy)) found.add('policy.field_invalid', problem.message, problem.path)
  if (isObject(policy)) {
    for (const problem of profileFieldProblems(policy.profile)) {
      found.add('profile.field_invalid', problem.message, problem.path)
    }
    const manifests = policy.circleManifests
    if (isList(manifests)) {
      for (let index = 0; index < manifests.length; index++) {
        for (const problem of manifestFieldProblems(manifests[index], `circleManifests[${index}]`)) {
          found.add('circle.manifest_field_invalid', problem.message, problem.path)
        }
      }
    }
  }
  return found.issues
}
