import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // nostr-veil subpath exports — must come before the root alias
      { find: 'nostr-veil/nip85', replacement: path.resolve(__dirname, '../src/nip85/index.ts') },
      { find: 'nostr-veil/proof', replacement: path.resolve(__dirname, '../src/proof/index.ts') },
      { find: 'nostr-veil/identity', replacement: path.resolve(__dirname, '../src/identity/index.ts') },
      { find: 'nostr-veil/graph', replacement: path.resolve(__dirname, '../src/scorer/index.ts') },
      { find: /^nostr-veil$/, replacement: path.resolve(__dirname, '../src/index.ts') },
      // @forgesworn/ring-sig uses bare imports without .js — map them to the correct exports
      { find: '@noble/hashes/utils', replacement: '@noble/hashes/utils.js' },
      { find: '@noble/hashes/sha256', replacement: '@noble/hashes/sha2.js' },
      { find: '@noble/curves/secp256k1', replacement: '@noble/curves/secp256k1.js' },
    ],
    dedupe: ['@noble/curves', '@noble/hashes'],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
})
