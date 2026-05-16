import { describe, it, expect } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { createTrustCircle } from '../../src/proof/circle.js'
import { contributeAssertion } from '../../src/proof/contribute.js'

describe('contributeAssertion', () => {
  const privKeys = [
    '0101010101010101010101010101010101010101010101010101010101010101',
    '0202020202020202020202020202020202020202020202020202020202020202',
    '0303030303030303030303030303030303030303030303030303030303030303',
  ]
  const pubKeys = privKeys.map(k => bytesToHex(schnorr.getPublicKey(hexToBytes(k))))
  const circle = createTrustCircle(pubKeys)
  const subject = 'dd'.repeat(32)
  const metrics = { rank: 85 }

  it('returns a signature, keyImage, and metrics', () => {
    const memberIndex = circle.members.indexOf(pubKeys[0])
    const result = contributeAssertion(circle, subject, metrics, privKeys[0], memberIndex)
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

  it('scopes the electionId to the circleId by default', () => {
    const result = contributeAssertion(circle, subject, metrics, privKeys[0], circle.members.indexOf(pubKeys[0]))
    expect(result.signature.electionId).toBe(`veil:v1:${circle.circleId}:${subject}`)
  })

  it('scopes the electionId to the federation scope when the circle has one', () => {
    const scoped = createTrustCircle(pubKeys, { scope: 'fed-1' })
    const result = contributeAssertion(scoped, subject, metrics, privKeys[0], scoped.members.indexOf(pubKeys[0]))
    expect(result.signature.electionId).toBe(`veil:v1:fed-1:${subject}`)
  })

  it('yields a matching key image for one signer across circles sharing a scope', () => {
    const circleA = createTrustCircle([pubKeys[0], pubKeys[1]], { scope: 'fed-1' })
    const circleB = createTrustCircle([pubKeys[0], pubKeys[2]], { scope: 'fed-1' })
    const a = contributeAssertion(circleA, subject, metrics, privKeys[0], circleA.members.indexOf(pubKeys[0]))
    const b = contributeAssertion(circleB, subject, metrics, privKeys[0], circleB.members.indexOf(pubKeys[0]))
    expect(circleA.circleId).not.toBe(circleB.circleId)
    expect(a.keyImage).toBe(b.keyImage)
  })

  it('yields distinct key images for one signer across unscoped circles', () => {
    const circleA = createTrustCircle([pubKeys[0], pubKeys[1]])
    const circleB = createTrustCircle([pubKeys[0], pubKeys[2]])
    const a = contributeAssertion(circleA, subject, metrics, privKeys[0], circleA.members.indexOf(pubKeys[0]))
    const b = contributeAssertion(circleB, subject, metrics, privKeys[0], circleB.members.indexOf(pubKeys[0]))
    expect(a.keyImage).not.toBe(b.keyImage)
  })
})
