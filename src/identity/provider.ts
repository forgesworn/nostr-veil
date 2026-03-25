import { fromNsec, derive, zeroise } from 'nsec-tree/core'
import type { Identity } from 'nsec-tree'
import type { EventTemplate } from '../nip85/types.js'
import type { ProviderTree } from './types.js'

/** Derive per-algorithm provider identities from a master nsec. Call `.destroy()` when done. */
export function createProviderTree(rootNsec: string, algorithms: string[]): ProviderTree {
  const root = fromNsec(rootNsec)
  const algorithmMap = new Map<string, Identity>()
  const metadataMap = new Map<string, EventTemplate>()

  for (const algo of algorithms) {
    const identity = derive(root, `veil:provider:${algo}`, 0)
    algorithmMap.set(algo, identity)

    metadataMap.set(algo, {
      kind: 0,
      tags: [],
      content: JSON.stringify({
        name: `Veil Provider: ${algo}`,
        about: `NIP-85 trust assertion provider — ${algo} algorithm. Part of the nostr-veil privacy-preserving Web of Trust.`,
      }),
    })
  }

  return {
    algorithms: algorithmMap,
    metadataTemplates: metadataMap,
    destroy() {
      for (const identity of algorithmMap.values()) zeroise(identity)
      root.destroy()
    },
  }
}
