import { fromNsec, derive, zeroise } from 'nsec-tree/core'
import type { Identity } from 'nsec-tree'
import type { EventTemplate } from '../nip85/types.js'
import type { ProviderTree } from './types.js'

/**
 * Derive per-algorithm provider identities from a master nsec.
 *
 * Uses nsec-tree to derive a separate child identity for each algorithm name,
 * keeping algorithm-specific signing keys isolated from the master key. Each
 * derived identity has a corresponding kind 0 metadata template pre-populated
 * with a descriptive name and about text.
 *
 * Call `.destroy()` on the returned handle when done to zeroise all key material.
 *
 * @param rootNsec - Bech32-encoded master nsec (`nsec1…`) used as the derivation root
 * @param algorithms - Algorithm names to derive identities for (e.g. `['lsag-median', 'lsag-mean']`)
 * @returns A {@link ProviderTree} containing the derived identity map, metadata templates, and a `destroy` method
 *
 * @example
 * const tree = createProviderTree(masterNsec, ['lsag-median'])
 * const providerIdentity = tree.algorithms.get('lsag-median')!
 * // publish tree.metadataTemplates.get('lsag-median') as the provider's kind 0
 * tree.destroy()
 */
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
      algorithmMap.clear()
      metadataMap.clear()
      root.destroy()
    },
  }
}
