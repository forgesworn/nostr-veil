# Examples

Runnable examples for nostr-veil. Each script is self-contained.

## Run

```bash
npx tsx examples/basic-circle.ts
npx tsx examples/partial-threshold.ts
npx tsx examples/nip85-provider.ts
npx tsx examples/typed-assertions.ts
npx tsx examples/use-cases.ts
```

Requires [tsx](https://github.com/privatenumber/tsx) (`npx tsx` works without installing).

`typed-assertions.ts` uses opt-in proof v2 for event, addressable, and identifier assertions.

`use-cases.ts` maps the main supported use cases to concrete assertion kinds,
subject formats, helper functions, and proof v2 verification. Pair it with
[`docs/use-cases.md`](../docs/use-cases.md), which explains the production
boundary and the companion controls each use case needs.
