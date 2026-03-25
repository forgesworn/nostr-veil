import { describe, it, expect, afterEach } from 'vitest'
import { createProviderTree } from '../../src/identity/provider.js'

// Valid nsec: 32 bytes of 0x01, bech32-encoded
// Generated via: node --input-type=module -e "import {encodeNsec} from 'nsec-tree/encoding'; console.log(encodeNsec(new Uint8Array(32).fill(1)))"
const TEST_NSEC = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw'

describe('createProviderTree', () => {
  it('derives one identity per algorithm', () => {
    const tree = createProviderTree(TEST_NSEC, ['lsag', 'pagerank'])
    expect(tree.algorithms.size).toBe(2)
    expect(tree.algorithms.has('lsag')).toBe(true)
    expect(tree.algorithms.has('pagerank')).toBe(true)
    tree.destroy()
  })

  it('produces distinct pubkeys per algorithm', () => {
    const tree = createProviderTree(TEST_NSEC, ['lsag', 'pagerank', 'hops'])
    const pubkeys = [...tree.algorithms.values()].map(id => id.npub)
    const unique = new Set(pubkeys)
    expect(unique.size).toBe(3)
    tree.destroy()
  })

  it('produces kind 0 metadata templates for each algorithm', () => {
    const tree = createProviderTree(TEST_NSEC, ['lsag', 'pagerank'])
    expect(tree.metadataTemplates.size).toBe(2)

    for (const [algo, template] of tree.metadataTemplates) {
      expect(template.kind).toBe(0)
      expect(Array.isArray(template.tags)).toBe(true)
      const content = JSON.parse(template.content)
      expect(content.name).toContain(algo)
      expect(content.about).toContain(algo)
    }
    tree.destroy()
  })

  it('is deterministic for the same input', () => {
    const treeA = createProviderTree(TEST_NSEC, ['lsag'])
    const treeB = createProviderTree(TEST_NSEC, ['lsag'])

    const pubkeyA = treeA.algorithms.get('lsag')!.npub
    const pubkeyB = treeB.algorithms.get('lsag')!.npub

    expect(pubkeyA).toBe(pubkeyB)

    treeA.destroy()
    treeB.destroy()
  })

  it('destroy() zeroises key material', () => {
    const tree = createProviderTree(TEST_NSEC, ['lsag'])
    const identity = tree.algorithms.get('lsag')!
    const privateKey = identity.privateKey

    tree.destroy()

    expect(privateKey.every(b => b === 0)).toBe(true)
  })

  it('handles an empty algorithm list', () => {
    const tree = createProviderTree(TEST_NSEC, [])
    expect(tree.algorithms.size).toBe(0)
    expect(tree.metadataTemplates.size).toBe(0)
    tree.destroy()
  })

  it('metadata content includes nostr-veil attribution', () => {
    const tree = createProviderTree(TEST_NSEC, ['lsag'])
    const template = tree.metadataTemplates.get('lsag')!
    const content = JSON.parse(template.content)
    expect(content.about).toContain('nostr-veil')
    tree.destroy()
  })
})
