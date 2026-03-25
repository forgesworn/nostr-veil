import type { Identity, Persona, LinkageProof } from 'nsec-tree'
import type { EventTemplate } from '../nip85/types.js'

export interface ProviderTree {
  algorithms: Map<string, Identity>
  metadataTemplates: Map<string, EventTemplate>
  destroy(): void
}

export interface PersonaHandle {
  persona: Persona
  destroy(): void
}

export type DisclosureProofs = [LinkageProof, LinkageProof]
