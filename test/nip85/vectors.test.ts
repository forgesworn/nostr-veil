/**
 * Frozen NIP-85 interoperability test vectors.
 *
 * These 10 vectors (2 per NIP-85 kind) are canonical: any conformant NIP-85
 * implementation must produce identical events from the same inputs. Each
 * vector is tested in three directions:
 *
 *   1. Build from input params -> assert output matches frozen event
 *   2. Parse frozen event      -> assert parsed data matches input
 *   3. Validate frozen event   -> assert valid (assertion kinds only)
 */
import { describe, it, expect } from 'vitest'
import {
  buildUserAssertion,
  buildEventAssertion,
  buildAddressableAssertion,
  buildIdentifierAssertion,
  buildProviderDeclaration,
} from '../../src/nip85/builders.js'
import { parseAssertion, parseProviderDeclaration } from '../../src/nip85/parsers.js'
import { validateAssertion } from '../../src/nip85/validators.js'
import type { UserMetrics, EventMetrics, IdentifierMetrics, ProviderEntry } from '../../src/nip85/types.js'
import vectors from './vectors.json' with { type: 'json' }

// ── helpers ──────────────────────────────────────────────────────────

type Vector = (typeof vectors.vectors)[number]

function buildFromVector(v: Vector) {
  const { input } = v
  switch (input.builder) {
    case 'buildUserAssertion':
      return buildUserAssertion(input.pubkey!, input.metrics as UserMetrics)
    case 'buildEventAssertion':
      return buildEventAssertion(input.eventId!, input.metrics as EventMetrics)
    case 'buildAddressableAssertion':
      return buildAddressableAssertion(input.address!, input.metrics as EventMetrics)
    case 'buildIdentifierAssertion':
      return buildIdentifierAssertion(
        input.identifier!,
        input.kTag!,
        input.metrics as IdentifierMetrics,
      )
    case 'buildProviderDeclaration':
      return buildProviderDeclaration(
        input.providers! as ProviderEntry[],
        (input as Record<string, unknown>).encryptedContent as string | undefined,
      )
    default:
      throw new Error(`Unknown builder: ${input.builder}`)
  }
}

/** Tags that carry structural metadata rather than metric values */
const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k'])

function isAssertionKind(kind: number): boolean {
  return [30382, 30383, 30384, 30385].includes(kind)
}

// ── tests ────────────────────────────────────────────────────────────

describe('frozen NIP-85 test vectors', () => {
  it('vectors.json contains exactly 10 vectors', () => {
    expect(vectors.vectors).toHaveLength(10)
  })

  describe.each(vectors.vectors)('$id — $description', (vector) => {
    it('builder produces the frozen event', () => {
      const result = buildFromVector(vector)
      expect(result.kind).toBe(vector.expected.kind)
      expect(result.tags).toEqual(vector.expected.tags)
      expect(result.content).toBe(vector.expected.content)
    })

    if (isAssertionKind(vector.expected.kind)) {
      it('parser round-trips the frozen event', () => {
        const parsed = parseAssertion(vector.expected)
        const dTag = vector.expected.tags.find((t: string[]) => t[0] === 'd')
        expect(parsed.kind).toBe(vector.expected.kind)
        expect(parsed.subject).toBe(dTag?.[1] ?? '')

        // Every non-meta tag in the frozen event should appear in parsed metrics
        for (const tag of vector.expected.tags) {
          if (META_TAGS.has(tag[0])) continue
          expect(parsed.metrics).toHaveProperty(tag[0], tag[1])
        }
      })

      it('validator accepts the frozen event', () => {
        const result = validateAssertion(vector.expected)
        expect(result.valid).toBe(true)
        expect(result.errors).toEqual([])
      })
    }

    if (vector.expected.kind === 10040 && vector.expected.content === '') {
      it('provider parser round-trips the frozen event', () => {
        const parsed = parseProviderDeclaration(vector.expected)
        const providers = vector.input.providers!
        expect(parsed).toHaveLength(providers.length)

        for (let i = 0; i < providers.length; i++) {
          const p = providers[i]
          expect(parsed[i].kind).toBe(p.kind)
          expect(parsed[i].metric).toBe(p.metric)
          expect(parsed[i].servicePubkey).toBe(p.servicePubkey)
          expect(parsed[i].relayHint).toBe(p.relayHint)
        }
      })
    }

    if (vector.expected.kind === 10040 && vector.expected.content !== '') {
      it('encrypted provider has empty tags and non-empty content', () => {
        expect(vector.expected.tags).toEqual([])
        expect(vector.expected.content).toBeTruthy()
      })
    }
  })
})
