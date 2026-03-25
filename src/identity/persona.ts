import { fromNsec } from 'nsec-tree/core'
import { derivePersona } from 'nsec-tree/persona'
import type { PersonaHandle } from './types.js'

export function createUserPersona(rootNsec: string, name: string): PersonaHandle {
  const root = fromNsec(rootNsec)
  const persona = derivePersona(root, name)
  return {
    persona,
    destroy() { root.destroy() },
  }
}
