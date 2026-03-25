import { describe, it, expect } from 'vitest'
import { fromNsec, derive } from 'nsec-tree/core'
import { verifyProof } from 'nsec-tree/proof'
import { proveCommonOwnership, buildDisclosureEvent } from '../../src/identity/disclosure.js'

const TEST_NSEC = 'nsec1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqstywftw'

describe('proveCommonOwnership', () => {
  it('returns two proofs with the same masterPubkey', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const [proofA, proofB] = proveCommonOwnership(root, identityA, identityB)
    expect(proofA.masterPubkey).toBe(proofB.masterPubkey)
    root.destroy()
  })

  it('blind proofs lack purpose and index', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const [proofA, proofB] = proveCommonOwnership(root, identityA, identityB, 'blind')
    expect(proofA.purpose).toBeUndefined()
    expect(proofA.index).toBeUndefined()
    expect(proofB.purpose).toBeUndefined()
    expect(proofB.index).toBeUndefined()
    root.destroy()
  })

  it('full proofs include purpose and index', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const [proofA, proofB] = proveCommonOwnership(root, identityA, identityB, 'full')
    expect(proofA.purpose).toBeDefined()
    expect(proofA.index).toBeDefined()
    expect(proofB.purpose).toBeDefined()
    expect(proofB.index).toBeDefined()
    root.destroy()
  })

  it('both proofs are verifiable', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const [proofA, proofB] = proveCommonOwnership(root, identityA, identityB)
    expect(verifyProof(proofA)).toBe(true)
    expect(verifyProof(proofB)).toBe(true)
    root.destroy()
  })
})

describe('buildDisclosureEvent', () => {
  it('produces a kind 30078 event', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const proofs = proveCommonOwnership(root, identityA, identityB)
    const event = buildDisclosureEvent(proofs)
    expect(event.kind).toBe(30078)
    root.destroy()
  })

  it('d-tag starts with veil:disclosure:', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const proofs = proveCommonOwnership(root, identityA, identityB)
    const event = buildDisclosureEvent(proofs)
    const dTag = event.tags.find(t => t[0] === 'd')
    expect(dTag).toBeDefined()
    expect(dTag![1]).toMatch(/^veil:disclosure:/)
    root.destroy()
  })

  it('includes veil-linkage_a, veil-linkage_b, and veil-master tags', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const proofs = proveCommonOwnership(root, identityA, identityB)
    const event = buildDisclosureEvent(proofs)
    const tagNames = event.tags.map(t => t[0])
    expect(tagNames).toContain('veil-linkage_a')
    expect(tagNames).toContain('veil-linkage_b')
    expect(tagNames).toContain('veil-master')
    root.destroy()
  })

  it('veil-master tag holds the masterPubkey', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const proofs = proveCommonOwnership(root, identityA, identityB)
    const event = buildDisclosureEvent(proofs)
    const masterTag = event.tags.find(t => t[0] === 'veil-master')
    expect(masterTag![1]).toBe(proofs[0].masterPubkey)
    root.destroy()
  })

  it('content is empty', () => {
    const root = fromNsec(TEST_NSEC)
    const identityA = derive(root, 'algo:lsag')
    const identityB = derive(root, 'algo:pagerank')
    const proofs = proveCommonOwnership(root, identityA, identityB)
    const event = buildDisclosureEvent(proofs)
    expect(event.content).toBe('')
    root.destroy()
  })
})
