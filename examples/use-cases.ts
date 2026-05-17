/**
 * Executable use-case examples for nostr-veil.
 *
 * Each detail page in docs/use-case-pages includes one file from
 * examples/use-cases/. This runner imports those canonical examples and fails
 * if any example no longer verifies.
 *
 * Run: npx tsx examples/use-cases.ts
 */
import { useCaseResults } from './use-cases/_all.js'
import { printResult } from './use-cases/_shared.js'

for (const result of useCaseResults) {
  printResult(result)
}
