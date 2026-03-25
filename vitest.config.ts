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
      'nostr-veil/identity': new URL('./src/identity/index.ts', import.meta.url).pathname,
      // noble v2 uses .js extensions in exports map and requires Uint8Array (not hex strings).
      // The compat shim wraps schnorr to accept both hex strings and Uint8Array.
      '@noble/curves/secp256k1': new URL('./src/_noble-compat.ts', import.meta.url).pathname,
      '@noble/hashes/sha2.js': new URL('./node_modules/@noble/hashes/sha2.js', import.meta.url).pathname,
      '@noble/hashes/utils.js': new URL('./node_modules/@noble/hashes/utils.js', import.meta.url).pathname,
    },
  },
})
