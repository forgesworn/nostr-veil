import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      'nostr-veil': new URL('./src/index.ts', import.meta.url).pathname,
      'nostr-veil/nip85': new URL('./src/nip85/index.ts', import.meta.url).pathname,
      'nostr-veil/proof': new URL('./src/proof/index.ts', import.meta.url).pathname,
    },
  },
})
