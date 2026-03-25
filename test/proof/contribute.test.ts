import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion } from '../../src/proof/contribute.js'

describe('contributeAssertion', () => {
  const privKeys = [
    '0101010101010101010101010101010101010101010101010101010101010101',
    '0202020202020202020202020202020202020202020202020202020202020202',
    '0303030303030303030303030303030303030303030303030303030303030303',
  ]
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(k)))
  const circle = createTrustCircle(pubKeys)
  const subject = 'dd'.repeat(32)
  const metrics = { rank: 85 }

  it('returns an attestation, signature, and keyImage', () => {
    const memberIndex = circle.members.indexOf(pubKeys[0])
    const result = contributeAssertion(circle, subject, metrics, privKeys[0], memberIndex)
    expect(result.attestation).toBeDefined()
    expect(result.attestation.kind).toBe(31000)
    expect(result.signature).toBeDefined()
    expect(result.keyImage).toMatch(/^[0-9a-f]+$/)
    expect(result.metrics).toEqual(metrics)
  })

  it('produces a valid LSAG signature', async () => {
    const { lsagVerify } = await import('@forgesworn/ring-sig')
    const memberIndex = circle.members.indexOf(pubKeys[0])
    const result = contributeAssertion(circle, subject, metrics, privKeys[0], memberIndex)
    expect(lsagVerify(result.signature)).toBe(true)
  })

  it('produces different key images for different members', () => {
    const idx0 = circle.members.indexOf(pubKeys[0])
    const idx1 = circle.members.indexOf(pubKeys[1])
    const r0 = contributeAssertion(circle, subject, metrics, privKeys[0], idx0)
    const r1 = contributeAssertion(circle, subject, metrics, privKeys[1], idx1)
    expect(r0.keyImage).not.toBe(r1.keyImage)
  })
})
