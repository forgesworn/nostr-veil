# Contributing to nostr-veil

## Setup

```bash
git clone https://github.com/forgesworn/nostr-veil.git
cd nostr-veil
npm install
npm run build
npm test
```

## Development

```bash
npm test          # run all tests once
npm run test:watch # watch mode
npm run lint      # type-check only (no emit)
npm run demo      # start the interactive demo (Vite dev server)
```

The demo is a separate Vite app in `demo/` with its own `package.json`. Run `cd demo && npm install` if it hasn't been set up.

## Project structure

- `src/nip85/` — NIP-85 event builders, parsers, validators, filters
- `src/proof/` — LSAG ring-signature trust circles, contributions, aggregation, verification
- `src/identity/` — nsec-tree provider trees, personas, disclosure proofs
- `src/signing.ts` — BIP-340 Schnorr event signing
- `test/` — mirrors `src/` structure
- `demo/` — Vite + React interactive demo

## Conventions

- **British English** — licence, serialise, initialise, behaviour
- **ESM only** — `.js` extensions in all local imports
- **TDD** — write the failing test first, then the implementation
- **Commits** — `type: description` format (e.g. `feat:`, `fix:`, `docs:`, `test:`)

## Testing

Tests use [Vitest](https://vitest.dev/). Each module has its own test file mirroring the source path:

```
src/proof/circle.ts  →  test/proof/circle.test.ts
```

Run a single test file:
```bash
npx vitest run test/proof/circle.test.ts
```

## Pull requests

1. Fork and create a branch from `main`
2. Write tests for any new functionality
3. Ensure `npm test` and `npm run build` pass
4. Keep commits focused — one logical change per commit
5. Open a PR with a clear description of what and why

## Licence

By contributing you agree your contributions will be licensed under MIT.

---

## How to add a new assertion kind

This guide walks through adding full support for a new NIP-85 assertion kind,
using the hypothetical kind 30386 as the running example.

### 1. Add types to `src/nip85/types.ts`

Add a metrics interface for the new kind and a constant to `NIP85_KINDS`:

```ts
// In NIP85_KINDS:
NEW_KIND: 30386,

// New metrics interface:
export interface NewKindMetrics {
  rank?: number
  my_custom_metric?: number
}
```

### 2. Add a builder to `src/nip85/builders.ts`

Follow the pattern of the existing builders. Import your new metrics type,
choose the correct structural tags (`d` + an identifying tag such as `e` or
`a`), and convert metrics with `metricsToTags`:

```ts
export function buildNewKindAssertion(subject: string, metrics: NewKindMetrics): EventTemplate {
  return {
    kind: NIP85_KINDS.NEW_KIND,
    tags: [['d', subject], ['x', subject], ...metricsToTags(metrics)],
    content: '',
  }
}
```

Add full JSDoc with `@param`, `@returns`, and `@example` tags.

### 3. Update the parser if needed

`parseAssertion` in `src/nip85/parsers.ts` is generic — it works for any kind
that uses a `d` tag. If your new kind introduces a new structural tag (like `x`
in the example above) that should be skipped during metric extraction, add it to
the `META_TAGS` set:

```ts
const META_TAGS = new Set(['d', 'p', 'e', 'a', 'k', 'x'])
```

### 4. Add validator rules to `src/nip85/validators.ts`

Add the new kind to `ASSERTION_KINDS` so `validateAssertion` accepts it:

```ts
const ASSERTION_KINDS = new Set<number>([
  NIP85_KINDS.USER,
  NIP85_KINDS.EVENT,
  NIP85_KINDS.ADDRESSABLE,
  NIP85_KINDS.IDENTIFIER,
  NIP85_KINDS.NEW_KIND,  // add this
])
```

If the new kind has metric-specific validation rules (value ranges, required
fields), add them inside `validateAssertion` after the existing `rank` check,
guarded by `event.kind === NIP85_KINDS.NEW_KIND`.

### 5. Write tests

Create `test/nip85/newkind.test.ts` (mirror the source path). Cover at minimum:

- `buildNewKindAssertion` produces the correct kind, d-tag, and metric tags
- `parseAssertion` correctly extracts the subject and metrics
- `validateAssertion` accepts a valid event and rejects each invalid case
- `assertionFilter` returns the right filter for the new kind

```ts
import { describe, it, expect } from 'vitest'
import { buildNewKindAssertion, parseAssertion, validateAssertion, NIP85_KINDS } from '../../src/nip85/index.js'

describe('kind 30386', () => {
  it('builds with correct kind and tags', () => {
    const tmpl = buildNewKindAssertion('subject123', { rank: 50 })
    expect(tmpl.kind).toBe(NIP85_KINDS.NEW_KIND)
    expect(tmpl.tags).toContainEqual(['d', 'subject123'])
  })
})
```

### 6. Update the barrel export

`src/nip85/index.ts` already re-exports everything via `export * from './builders.js'`
etc., so no changes are needed there. If you created a new file (e.g. a separate
`src/nip85/newkind.ts`), add it:

```ts
export * from './newkind.js'
```

### 7. Update documentation

- Add the new kind to `NIP85_KINDS` section of `llms.txt` and `llms-full.txt`
- Update the API surface list in `llms.txt`
- Add a row to the README kind table if one exists

---

## How to add a new proof tag

This guide walks through adding a new `veil-*` tag to the ring-signature proof
layer, using a hypothetical `veil-algo` tag as the running example.

### 1. Emit the tag in `src/proof/aggregate.ts`

Inside `aggregateContributions`, add the new tag to the returned event's `tags`
array:

```ts
return {
  kind: NIP85_KINDS.USER,
  tags: [
    ['d', subject],
    ['p', subject],
    ...metricTags,
    ['veil-ring', ...circle.members],
    ['veil-threshold', String(contributions.length), String(circle.size)],
    ['veil-algo', 'lsag-secp256k1'],   // new tag
    ...sigTags,
  ],
  content: '',
}
```

If the tag value is derived from inputs (e.g. the aggregation function name),
thread it through the function signature and update callers.

### 2. Parse the tag in `src/proof/verify.ts`

Read the new tag in `verifyProof` and incorporate it into validation logic or
the returned `ProofVerification` object. If the tag is informational only, you
can expose it as an additional field. If it affects validity, add error messages
to the `errors` array:

```ts
const algoTag = event.tags.find(t => t[0] === 'veil-algo')
const algorithm = algoTag?.[1] ?? 'unknown'
// Optionally validate: if (algorithm !== 'lsag-secp256k1') errors.push(…)
```

If the new field is meaningful to callers, extend `ProofVerification` in
`src/proof/types.ts`:

```ts
export interface ProofVerification {
  // …existing fields…
  algorithm?: string
}
```

### 3. Add the tag name to the skip list in `src/nip85/parsers.ts`

`parseAssertion` skips tags that start with `veil-` automatically via:

```ts
if (META_TAGS.has(name) || name.startsWith('veil-')) continue
```

No change is needed — all `veil-*` tags are already excluded from metric
extraction. If your tag does not start with `veil-`, add it to `META_TAGS`
explicitly.

### 4. Write tests

Add test cases to `test/proof/` covering:

- `aggregateContributions` emits the new tag with the correct value
- `verifyProof` reads the tag correctly and surfaces the value (or rejects when invalid)
- Round-trip: build → aggregate → verify produces a consistent result

```ts
it('emits veil-algo tag', () => {
  const tmpl = aggregateContributions(circle, subject, [contrib])
  const algoTag = tmpl.tags.find(t => t[0] === 'veil-algo')
  expect(algoTag?.[1]).toBe('lsag-secp256k1')
})
```

### 5. Update `llms.txt` and `llms-full.txt`

Add the new tag to the proof tag table in both files:

```
| `veil-algo` | `['veil-algo', algorithmId]` | Identifies the ring signature algorithm used |
```

Update the "Key Concepts" section in the README accordingly.
