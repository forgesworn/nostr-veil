import { readFileSync } from 'node:fs'

/**
 * Load Nostr secret key from environment variables.
 *
 * Environment variables:
 *   NOSTR_SECRET_KEY       -- 64-char hex private key
 *   NOSTR_SECRET_KEY_FILE  -- path to secret key file (takes precedence)
 *
 * @returns {{ secretKey: string }}
 */
export function loadConfig() {
  const keyFile = process.env.NOSTR_SECRET_KEY_FILE
  const keyEnv = process.env.NOSTR_SECRET_KEY

  let secretKey
  if (keyFile) {
    secretKey = readFileSync(keyFile, 'utf-8').trim()
  } else if (keyEnv) {
    secretKey = keyEnv.trim()
  } else {
    throw new Error(
      'Set NOSTR_SECRET_KEY or NOSTR_SECRET_KEY_FILE environment variable (64-char hex)'
    )
  }

  if (!/^[0-9a-f]{64}$/i.test(secretKey)) {
    throw new Error(
      'NOSTR_SECRET_KEY must be a 64-character hex private key'
    )
  }

  // Scrub secrets from the environment
  delete process.env.NOSTR_SECRET_KEY
  delete process.env.NOSTR_SECRET_KEY_FILE

  return { secretKey: secretKey.toLowerCase() }
}
