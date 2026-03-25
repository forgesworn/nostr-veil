import type { ValidationResult } from './types.js'
import { NIP85_KINDS } from './types.js'

const ASSERTION_KINDS = new Set<number>([
  NIP85_KINDS.USER,
  NIP85_KINDS.EVENT,
  NIP85_KINDS.ADDRESSABLE,
  NIP85_KINDS.IDENTIFIER,
])

interface RawEvent {
  kind: number
  tags: string[][]
  content: string
}

/**
 * Validates a NIP-85 assertion event.
 *
 * Checks:
 * - `kind` is one of the four NIP-85 assertion kinds (30382–30385)
 * - A `d` tag is present
 * - `rank`, if present, is a number in the range 0–100
 */
export function validateAssertion(event: RawEvent): ValidationResult {
  const errors: string[] = []

  if (!ASSERTION_KINDS.has(event.kind)) {
    errors.push(`Invalid kind: ${event.kind}. Must be one of 30382, 30383, 30384, 30385.`)
  }

  const dTag = event.tags.find(t => t[0] === 'd')
  if (!dTag) {
    errors.push('Missing required d-tag.')
  }

  const rankTag = event.tags.find(t => t[0] === 'rank')
  if (rankTag !== undefined) {
    const rankValue = Number(rankTag[1])
    if (isNaN(rankValue) || rankValue < 0 || rankValue > 100) {
      errors.push(`Invalid rank value: "${rankTag[1]}". Must be a number between 0 and 100.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
