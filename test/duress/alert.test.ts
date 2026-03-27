import { describe, it, expect } from 'vitest'
import { propagateDuressAlert, decryptDuressAlert } from '../../src/duress/alert.js'
import { deriveDuressKey } from 'canary-kit/beacon'

const SEED = 'a'.repeat(64)
const PUBKEY = 'b'.repeat(64)

describe('propagateDuressAlert', () => {
  it('returns a non-empty encrypted string', async () => {
    const encrypted = await propagateDuressAlert(PUBKEY, SEED)
    expect(typeof encrypted).toBe('string')
    expect(encrypted.length).toBeGreaterThan(0)
  })

  it('round-trips: encrypt then decrypt recovers the alert', async () => {
    const encrypted = await propagateDuressAlert(PUBKEY, SEED)
    const key = deriveDuressKey(SEED)
    const decrypted = await decryptDuressAlert(key, encrypted)

    expect(decrypted.type).toBe('duress')
    expect(decrypted.member).toBe(PUBKEY)
    expect(decrypted.locationSource).toBe('none')
    expect(decrypted.geohash).toBe('')
    expect(decrypted.precision).toBe(0)
    expect(typeof decrypted.timestamp).toBe('number')
  })

  it('includes geohash when location is provided', async () => {
    const location = { geohash: 'gcpuuz', precision: 6 }
    const encrypted = await propagateDuressAlert(PUBKEY, SEED, location)
    const key = deriveDuressKey(SEED)
    const decrypted = await decryptDuressAlert(key, encrypted)

    expect(decrypted.geohash).toBe('gcpuuz')
    expect(decrypted.precision).toBe(6)
    expect(decrypted.locationSource).toBe('beacon')
  })

  it('works with null location', async () => {
    const encrypted = await propagateDuressAlert(PUBKEY, SEED, null)
    const key = deriveDuressKey(SEED)
    const decrypted = await decryptDuressAlert(key, encrypted)

    expect(decrypted.type).toBe('duress')
    expect(decrypted.member).toBe(PUBKEY)
    expect(decrypted.locationSource).toBe('none')
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const a = await propagateDuressAlert(PUBKEY, SEED)
    const b = await propagateDuressAlert(PUBKEY, SEED)
    expect(a).not.toBe(b)
  })
})
