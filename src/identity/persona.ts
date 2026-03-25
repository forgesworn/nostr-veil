import { fromNsec, zeroise } from 'nsec-tree/core'
import { derivePersona } from 'nsec-tree/persona'
import type { PersonaHandle } from './types.js'

/**
 * Derive a named persona from a master nsec using nsec-tree.
 *
 * The derived persona has its own independent keypair, suitable for anonymous
 * participation in trust circles without exposing the master identity. The
 * persona can later be linked back to the master key via
 * {@link proveCommonOwnership} if selective disclosure is needed.
 *
 * Call `.destroy()` on the returned handle when done to zeroise all key material.
 *
 * @param rootNsec - Bech32-encoded master nsec (`nsec1…`) used as the derivation root
 * @param name - Human-readable persona name used as the derivation path (e.g. `'whistleblower'`)
 * @returns A {@link PersonaHandle} containing the derived `Persona` and a `destroy` method
 *
 * @example
 * const handle = createUserPersona(masterNsec, 'whistleblower')
 * const anonPubkey = handle.persona.identity.pubkey
 * handle.destroy()
 */
export function createUserPersona(rootNsec: string, name: string): PersonaHandle {
  const root = fromNsec(rootNsec)
  const persona = derivePersona(root, name)
  return {
    persona,
    destroy() {
      zeroise(persona.identity)
      root.destroy()
    },
  }
}
