import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      'nostr-veil': new URL('./src/index.ts', import.meta.url).pathname,
      'nostr-veil/nip85': new URL('./src/nip85/index.ts', import.meta.url).pathname,
      'nostr-veil/profiles': new URL('./src/profiles/index.ts', import.meta.url).pathname,
      'nostr-veil/proof': new URL('./src/proof/index.ts', import.meta.url).pathname,
    },
  },
})
