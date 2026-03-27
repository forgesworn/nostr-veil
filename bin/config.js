import { readFileSync } from 'node:fs'

/**
 * Load Nostr secret key and relay configuration from environment variables.
 *
 * Environment variables:
 *   NOSTR_SECRET_KEY       -- nsec bech32, 64-char hex, or BIP-39 mnemonic
 *   NOSTR_SECRET_KEY_FILE  -- path to secret key file (takes precedence)
 *   NOSTR_RELAYS           -- comma-separated relay URLs
 *
 * @returns {{ secretKey: string, format: 'nsec' | 'hex' | 'mnemonic', relays: string[] }}
 */
export function loadConfig() {
  const keyFile = process.env.NOSTR_SECRET_KEY_FILE
  const keyEnv = process.env.NOSTR_SECRET_KEY
  const relayEnv = process.env.NOSTR_RELAYS

  let secretKey
  if (keyFile) {
    secretKey = readFileSync(keyFile, 'utf-8').trim()
  } else if (keyEnv) {
    secretKey = keyEnv.trim()
  } else {
    throw new Error(
      'Set NOSTR_SECRET_KEY or NOSTR_SECRET_KEY_FILE environment variable'
    )
  }

  const format = detectFormat(secretKey)
  const relays = relayEnv
    ? relayEnv.split(',').map(r => r.trim()).filter(Boolean)
    : []

  // Scrub secrets from the environment
  delete process.env.NOSTR_SECRET_KEY
  delete process.env.NOSTR_SECRET_KEY_FILE

  return { secretKey, format, relays }
}

/**
 * Auto-detect the secret key format.
 *
 * @param {string} key
 * @returns {'nsec' | 'hex' | 'mnemonic'}
 */
function detectFormat(key) {
  if (key.startsWith('nsec1')) return 'nsec'
  if (/^[0-9a-f]{64}$/i.test(key)) return 'hex'
  const words = key.split(/\s+/)
  if (words.length >= 12 && words.every(w => /^[a-z]+$/.test(w))) return 'mnemonic'
  throw new Error(
    'Unrecognised key format. Expected nsec1..., 64-char hex, or 12+ word mnemonic.'
  )
}
