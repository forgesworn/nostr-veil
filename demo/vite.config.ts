import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'nostr-veil': path.resolve(__dirname, '../src/index.ts'),
      'nostr-veil/nip85': path.resolve(__dirname, '../src/nip85/index.ts'),
      'nostr-veil/proof': path.resolve(__dirname, '../src/proof/index.ts'),
      'nostr-veil/identity': path.resolve(__dirname, '../src/identity/index.ts'),
    },
  },
})
