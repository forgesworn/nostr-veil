import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { lsagSign } from '@forgesworn/ring-sig'
import { canonicalMessage, computeCircleId, createTrustCircle, electionIdV2 } from '../../src/proof/circle.js'
import {
  contributeAddressableAssertion,
  contributeAddressableAssertionAsync,
  contributeAssertion,
  contributeAssertionAsync,
  contributeEventAssertion,
  contributeEventAssertionAsync,
  contributeIdentifierAssertion,
  contributeIdentifierAssertionAsync,
} from '../../src/proof/contribute.js'
import type { LsagSignRequest, LsagSigner } from '../../src/proof/contribute.js'
import type { Contribution, TrustCircle } from '../../src/proof/types.js'
import {
  aggregateContributions,
  aggregateEventContributions,
} from '../../src/proof/aggregate.js'
import { verifyProof } from '../../src/proof/verify.js'

const privKeys = ['01', '02', '03'].map(byte => byte.repeat(32))
const pubKeys = privKeys.map(key => bytesToHex(schnorr.getPublicKey(hexToBytes(key))))
const circle = createTrustCircle(pubKeys)
const subject = 'dd'.repeat(32)
const eventId = 'e1'.repeat(32)
const address = `30023:${'aa'.repeat(32)}:paper-1`

/** A signer that holds one member's key, as a hardware device or a remote bunker would. */
function signerFor(privateKey: string, seen: LsagSignRequest[] = []): LsagSigner {
  return {
    lsagSign(request) {
      seen.push(request)
      return Promise.resolve(lsagSign(request.message, request.ring, request.signerIndex, privateKey, request.electionId))
    },
  }
}

const index = (member: number) => circle.members.indexOf(pubKeys[member])

describe('contributeAssertionAsync', () => {
  it('produces a contribution that aggregates and verifies like a locally signed one', async () => {
    const contributions = await Promise.all(privKeys.map((key, member) =>
      contributeAssertionAsync(circle, subject, { rank: 80 + member }, signerFor(key), index(member)),
    ))
    const event = aggregateContributions(circle, subject, contributions)

    expect(verifyProof(event, { requireAggregate: 'median' }).valid).toBe(true)
    expect(event.tags.find(tag => tag[0] === 'rank')?.[1]).toBe('81')
  })

  it('asks the signer for exactly what the local helper signs', async () => {
    const seen: LsagSignRequest[] = []
    const remote = await contributeAssertionAsync(circle, subject, { rank: 80 }, signerFor(privKeys[0], seen), index(0))
    const local = contributeAssertion(circle, subject, { rank: 80 }, privKeys[0], index(0))

    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({
      electionId: local.signature.electionId,
      message: local.signature.message,
      ring: circle.members,
      signerIndex: index(0),
    })
    expect(remote.keyImage).toBe(local.keyImage)
    expect(remote.metrics).toEqual({ rank: 80 })
  })

  it('gives the typed helpers the same v2 binding as their local counterparts', async () => {
    const cases = [
      [
        await contributeEventAssertionAsync(circle, eventId, { rank: 1 }, signerFor(privKeys[1]), index(1)),
        contributeEventAssertion(circle, eventId, { rank: 1 }, privKeys[1], index(1)),
      ],
      [
        await contributeAddressableAssertionAsync(circle, address, { rank: 1 }, signerFor(privKeys[1]), index(1)),
        contributeAddressableAssertion(circle, address, { rank: 1 }, privKeys[1], index(1)),
      ],
      [
        await contributeIdentifierAssertionAsync(circle, 'doi:10.1000/182', 'doi', { rank: 1 }, signerFor(privKeys[1]), index(1)),
        contributeIdentifierAssertion(circle, 'doi:10.1000/182', 'doi', { rank: 1 }, privKeys[1], index(1)),
      ],
    ] as const

    for (const [remote, local] of cases) {
      expect(remote.signature.message).toBe(local.signature.message)
      expect(remote.signature.electionId).toBe(local.signature.electionId)
      expect(remote.keyImage).toBe(local.keyImage)
    }

    const event = aggregateEventContributions(circle, eventId, [cases[0][0]])
    expect(verifyProof(event, { requireProofVersion: 'v2' }).valid).toBe(true)
  })

  it('accepts a signer that answers synchronously', async () => {
    const signer: LsagSigner = {
      lsagSign: request => lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId),
    }
    const contribution = await contributeAssertionAsync(circle, subject, { rank: 80 }, signer, index(0))
    expect(contribution.keyImage).toMatch(/^[0-9a-f]{66}$/)
  })

  it('keeps only the signature fields, so a signer cannot attach who signed', async () => {
    const chatty: LsagSigner = {
      async lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
        return { ...signature, publicKey: pubKeys[0] } as never
      },
    }
    const contribution = await contributeAssertionAsync(circle, subject, { rank: 80 }, chatty, index(0))

    expect(Object.keys(contribution.signature).sort())
      .toEqual(['c0', 'electionId', 'keyImage', 'message', 'responses', 'ring'])
    expect(JSON.stringify(contribution)).not.toContain('publicKey')
  })

  it('rejects a signature made for a different message, election or ring', async () => {
    const wrongMessage: LsagSigner = {
      lsagSign: request => lsagSign(`${request.message} `, request.ring, request.signerIndex, privKeys[0], request.electionId),
    }
    const wrongElection: LsagSigner = {
      lsagSign: request => lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], `${request.electionId}:x`),
    }
    const otherRing = [...pubKeys.slice(0, 2), bytesToHex(schnorr.getPublicKey(hexToBytes('09'.repeat(32))))].sort()
    const wrongRing: LsagSigner = {
      lsagSign: request => lsagSign(request.message, otherRing, otherRing.indexOf(pubKeys[0]), privKeys[0], request.electionId),
    }

    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, wrongMessage, index(0)))
      .rejects.toThrow('External signer signed a different message')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, wrongElection, index(0)))
      .rejects.toThrow('External signer signed under a different election id')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, wrongRing, index(0)))
      .rejects.toThrow('External signer signed over a different ring')
  })

  it('rejects a malformed or invalid signature', async () => {
    const nothing: LsagSigner = { lsagSign: () => undefined as never }
    const tampered: LsagSigner = {
      lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
        return { ...signature, c0: 'f'.repeat(64) }
      },
    }

    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, nothing, index(0)))
      .rejects.toThrow('External signer did not return an LSAG signature')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, tampered, index(0)))
      .rejects.toThrow('External signer returned an invalid LSAG signature')
  })

  it('applies the same guards as the local helper before asking the signer', async () => {
    const seen: LsagSignRequest[] = []
    const signer = signerFor(privKeys[0], seen)

    await expect(contributeAssertionAsync(circle, pubKeys[0], { rank: 80 }, signer, index(0)))
      .rejects.toThrow('A circle member cannot contribute to an assertion about themselves')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, signer, 7))
      .rejects.toThrow('Signer index out of range')
    await expect(contributeAssertionAsync(circle, subject, { rank: Number.NaN }, signer, index(0)))
      .rejects.toThrow('must be a finite number')
    expect(seen).toHaveLength(0)
  })

  // ring-sig limits an election id to 512 bytes and refuses to sign a longer
  // one, so no signature over it can verify. A signer that asks its user to
  // approve each signature would ask about one that can never be used.
  it('turns away an election id too long to sign before asking the signer, as the local helper does', async () => {
    const seen: LsagSignRequest[] = []
    const long = `x:${'a'.repeat(512)}`
    // Multibyte: 200 characters, 600 bytes
    const wide = `x:${'€'.repeat(200)}`

    for (const identifier of [long, wide]) {
      expect(() => contributeIdentifierAssertion(circle, identifier, '0', { rank: 80 }, privKeys[0], index(0)))
        .toThrow('electionId length exceeds maximum of 512 bytes')
      await expect(contributeIdentifierAssertionAsync(circle, identifier, '0', { rank: 80 }, signerFor(privKeys[0], seen), index(0)))
        .rejects.toThrow('electionId length exceeds maximum of 512 bytes')
    }
    expect(seen).toHaveLength(0)
    // One that fits is still signed
    await contributeIdentifierAssertionAsync(circle, `x:${'a'.repeat(300)}`, '0', { rank: 80 }, signerFor(privKeys[0], seen), index(0))
    expect(seen).toHaveLength(1)
  })

  it('signs an election id of exactly 512 bytes in both helpers, and one of 513 in neither', async () => {
    const context = { kind: 30385, subjectTag: 'k', subjectTagValue: '0' } as const
    const fixed = electionIdV2(circle.circleId, '', context).length
    const identifier = (bytes: number) => `x:${'a'.repeat(bytes - fixed - 2)}`
    expect(electionIdV2(circle.circleId, identifier(512), context)).toHaveLength(512)

    const local = contributeIdentifierAssertion(circle, identifier(512), '0', { rank: 80 }, privKeys[0], index(0))
    const remote = await contributeIdentifierAssertionAsync(circle, identifier(512), '0', { rank: 80 }, signerFor(privKeys[0]), index(0))
    expect(local.signature.electionId).toHaveLength(512)
    expect(remote.signature.electionId).toHaveLength(512)

    expect(() => contributeIdentifierAssertion(circle, identifier(513), '0', { rank: 80 }, privKeys[0], index(0)))
      .toThrow('electionId length exceeds maximum of 512 bytes')
    await expect(contributeIdentifierAssertionAsync(circle, identifier(513), '0', { rank: 80 }, signerFor(privKeys[0]), index(0)))
      .rejects.toThrow('electionId length exceeds maximum of 512 bytes')
  })
})

describe('what the external signer is asked, and what is kept of its answer', () => {
  it('checks the answer against what it asked for, not the copy the signer was handed', async () => {
    const rewriting = (change: (request: LsagSignRequest) => void): LsagSigner => ({
      lsagSign(request) {
        change(request)
        return lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
      },
    })

    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, rewriting((request) => {
      request.message = canonicalMessage(circle.circleId, subject, { rank: 100 })
    }), index(0))).rejects.toThrow('External signer signed a different message')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, rewriting((request) => {
      request.electionId = 'some-other-election'
    }), index(0))).rejects.toThrow('External signer signed under a different election id')
    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, rewriting((request) => {
      request.ring = [request.ring[index(0)], request.ring[(index(0) + 1) % 3]]
      request.signerIndex = 0
    }), index(0))).rejects.toThrow('External signer signed over a different ring')
  })

  // ring-sig leaves its default domain, lsag-v1, out of a signature. A domain
  // of the signer's own is signed over, and is a field it could fill with
  // anything, such as who signed.
  it('rejects an answer under an LSAG domain of its own, and drops the default one', async () => {
    const underDomain = (domain: string | undefined, writeDefault = false): LsagSigner => ({
      lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId, domain)
        return writeDefault ? { ...signature, domain: 'lsag-v1' } : signature
      },
    })

    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, underDomain(`signer:${pubKeys[0]}`), index(0)))
      .rejects.toThrow('External signer signed under an LSAG domain nostr-veil does not use')
    const contribution = await contributeAssertionAsync(circle, subject, { rank: 80 }, underDomain(undefined, true), index(0))
    expect(Object.hasOwn(contribution.signature, 'domain')).toBe(false)
  })

  it('keeps plain copies of the signature\'s lists, so nothing on the signer\'s own lists travels on', async () => {
    const marking: LsagSigner = {
      lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
        return {
          ...signature,
          responses: Object.assign([...signature.responses], { toJSON: () => ['signed-by', pubKeys[0]] }),
          ring: Object.assign([...signature.ring], { signer: pubKeys[0] }),
        }
      },
    }
    const contribution = await contributeAssertionAsync(circle, subject, { rank: 80 }, marking, index(0))

    expect(JSON.stringify(contribution).includes('signed-by')).toBe(false)
    expect(Object.keys(contribution.signature.ring)).toEqual(['0', '1', '2'])
    expect(Object.hasOwn(contribution.signature.responses, 'toJSON')).toBe(false)
  })

  it('signs and keeps the metrics as they were when it was called', async () => {
    const metrics: Record<string, number> = { rank: 10 }
    const slow: LsagSigner = {
      lsagSign(request) {
        // The caller's object changes while the signer works
        metrics.rank = 99
        return lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
      },
    }
    const contribution = await contributeAssertionAsync(circle, subject, metrics, slow, index(0))

    expect(contribution.metrics).toEqual({ rank: 10 })
    expect(contribution.signature.message).toBe(canonicalMessage(circle.circleId, subject, { rank: 10 }))
  })

  it('turns away what ring-sig would refuse to sign, before asking the signer, with the error the local helper gives', async () => {
    const one = '00'.repeat(31) + '01'
    const many = Array.from({ length: 1_001 }, (_, i) => bytesToHex(schnorr.getPublicKey(hexToBytes((i + 1).toString(16).padStart(64, '0')))))
    const big = createTrustCircle(many)
    const lone: TrustCircle = { members: [pubKeys[0]], circleId: computeCircleId([pubKeys[0]]), size: 1 }
    const twice: TrustCircle = { members: [pubKeys[0], pubKeys[0]], circleId: computeCircleId([pubKeys[0], pubKeys[0]]), size: 2 }
    const offCurve = createTrustCircle([pubKeys[0], 'f'.repeat(64)])
    const cases: Array<[TrustCircle, Record<string, number>, string, number, string]> = [
      [big, { rank: 1 }, one, big.members.indexOf(many[0]), 'Ring size 1001 exceeds maximum of 1000'],
      [lone, { rank: 1 }, privKeys[0], 0, 'Ring must have at least 2 members'],
      [twice, { rank: 1 }, privKeys[0], 0, 'Ring contains duplicate members'],
      [circle, { ['m'.repeat(70_000)]: 1 }, privKeys[0], index(0), 'exceeds maximum of 65536 bytes'],
      [offCurve, { rank: 1 }, privKeys[0], offCurve.members.indexOf(pubKeys[0]), 'invalid field element'],
    ]

    for (const [ring, metrics, key, at, error] of cases) {
      const seen: LsagSignRequest[] = []
      expect(() => contributeAssertion(ring, subject, metrics, key, at)).toThrow(error)
      await expect(contributeAssertionAsync(ring, subject, metrics, signerFor(key, seen), at)).rejects.toThrow(error)
      expect(seen, error).toHaveLength(0)
    }
  })
})

describe('the local and the external helpers agree', () => {
  /** A signer that wraps ring-sig with the member's own key, as the local helper signs */
  const others = ['04', '05'].map(byte => bytesToHex(schnorr.getPublicKey(hexToBytes(byte.repeat(32)))))

  it('copies the signer\'s lists into plain lists, whatever kind of list it sends', async () => {
    // A list's own kind decides what a slice of it is
    class Marked extends Array<string> {
      toJSON(): string[] { return ['signed-by', pubKeys[0]] }
    }
    const marking: LsagSigner = {
      lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
        return { ...signature, responses: Marked.from(signature.responses), ring: Marked.from(signature.ring) }
      },
    }
    const contribution = await contributeAssertionAsync(circle, subject, { rank: 80 }, marking, index(0))

    expect(Object.getPrototypeOf(contribution.signature.responses)).toBe(Array.prototype)
    expect(Object.getPrototypeOf(contribution.signature.ring)).toBe(Array.prototype)
    expect(JSON.stringify(contribution).includes('signed-by')).toBe(false)
  })

  // A list is read up to its length, so one that claims to be far longer than
  // any ring would keep the helper reading
  it('does not read a list that claims to be longer than any ring', async () => {
    const endless: LsagSigner = {
      lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
        const responses = new Proxy([...signature.responses], {
          get: (target, key, receiver) => (key === 'length' ? 2 ** 32 - 1 : Reflect.get(target, key, receiver)),
        })
        return { ...signature, responses }
      },
    }

    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, endless, index(0)))
      .rejects.toThrow('External signer did not return an LSAG signature')
  }, 5_000)

  it('holds the ring to what it asked for, even sent as a list whose own checks always agree', async () => {
    class Agreeable extends Array<string> {}
    Object.defineProperty(Agreeable.prototype, 'some', { value: () => false })
    Object.defineProperty(Agreeable.prototype, 'every', { value: () => true })
    const elsewhere: LsagSigner = {
      lsagSign(request) {
        const ring = [pubKeys[0], ...others]
        const signature = lsagSign(request.message, ring, 0, privKeys[0], request.electionId)
        return { ...signature, ring: Agreeable.from(signature.ring) }
      },
    }

    await expect(contributeAssertionAsync(circle, subject, { rank: 80 }, elsewhere, index(0)))
      .rejects.toThrow('External signer signed over a different ring')
  })

  it('turns away metrics that are not an object, in both helpers', async () => {
    for (const metrics of [undefined, null, 5]) {
      const seen: LsagSignRequest[] = []
      expect(() => contributeAssertion(circle, subject, metrics as never, privKeys[0], index(0))).toThrow('metrics must be an object')
      await expect(contributeAssertionAsync(circle, subject, metrics as never, signerFor(privKeys[0], seen), index(0)))
        .rejects.toThrow('metrics must be an object')
      expect(seen).toHaveLength(0)
    }
  })

  it('reads each metric once, in both helpers, and keeps what it signed', async () => {
    const shifting = (): Record<string, number> => {
      let reads = 0
      return { get rank() { reads += 1; return reads === 1 ? 1 : 2 } }
    }
    const local = contributeAssertion(circle, subject, shifting(), privKeys[0], index(0))
    const remote = await contributeAssertionAsync(circle, subject, shifting(), signerFor(privKeys[0]), index(0))

    expect(local.metrics).toEqual({ rank: 1 })
    expect(remote.metrics).toEqual({ rank: 1 })
    expect(local.signature.message).toBe(canonicalMessage(circle.circleId, subject, { rank: 1 }))
    expect(remote.signature.message).toBe(local.signature.message)
  })

  // A member that is not a string is turned away with an error of the
  // external helpers' own: see the tests of lists built by hand
  it('gives the local helper\'s error for a malformed member key, in ring-sig\'s order', async () => {
    const handBuilt = (members: unknown[]): TrustCircle => ({ members: members as string[], circleId: 'ab'.repeat(32), size: members.length })
    const rings: unknown[][] = [
      [pubKeys[0], 'a'.repeat(63), pubKeys[1]],
      [pubKeys[0], 'z'.repeat(64)],
      [pubKeys[0], 'ab', 'zz'],
      [pubKeys[0], 'ab'.repeat(33)],
      [pubKeys[0], 'F'.repeat(64)],
    ]
    for (const members of rings) {
      const ring = handBuilt(members)
      let localError = ''
      try {
        contributeAssertion(ring, subject, { rank: 1 }, privKeys[0], 0)
      } catch (error) {
        localError = (error as Error).message
      }
      const seen: LsagSignRequest[] = []
      expect(localError, JSON.stringify(members)).not.toBe('')
      await expect(contributeAssertionAsync(ring, subject, { rank: 1 }, signerFor(privKeys[0], seen), 0)).rejects.toThrow(localError)
      expect(seen).toHaveLength(0)
    }
  })

  it('signs over a ring of upper-case keys as the local helper does', async () => {
    const upper: TrustCircle = { ...circle, members: circle.members.map(member => member.toUpperCase()) }
    const local = contributeAssertion(upper, subject, { rank: 80 }, privKeys[0], index(0))
    const remote = await contributeAssertionAsync(upper, subject, { rank: 80 }, signerFor(privKeys[0]), index(0))

    expect(remote.signature.ring).toEqual(local.signature.ring)
    expect(remote.signature.message).toBe(local.signature.message)
    expect(remote.keyImage).toBe(local.keyImage)
  })

  it('turns away members that are not a list, as the local helper does', async () => {
    const seen: LsagSignRequest[] = []
    const asSet = { ...circle, members: new Set(circle.members) } as unknown as TrustCircle

    expect(() => contributeAssertion(asSet, subject, { rank: 80 }, privKeys[0], 0)).toThrow('ring must be an array')
    await expect(contributeAssertionAsync(asSet, subject, { rank: 80 }, signerFor(privKeys[0], seen), 0)).rejects.toThrow('ring must be an array')
    expect(seen).toHaveLength(0)
  })
})

describe('the external helpers on input built by hand', () => {
  /** What both helpers give: the fields a contribution's signature shares between two signings, or the error */
  async function both(ring: TrustCircle, metrics: Record<string, number> = { rank: 1 }, at: unknown = index(0)) {
    const seen: LsagSignRequest[] = []
    const settle = async (run: () => Contribution | Promise<Contribution>) => {
      try {
        const contribution = await run()
        const { message, electionId, keyImage } = contribution.signature
        return { message, electionId, keyImage, ring: [...contribution.signature.ring] }
      } catch (error) {
        return { error: (error as Error).message }
      }
    }
    const local = await settle(() => contributeAssertion(ring, subject, metrics, privKeys[0], at as number))
    const remote = await settle(() => contributeAssertionAsync(ring, subject, metrics, signerFor(privKeys[0], seen), at as number))
    return { local, remote, asked: seen }
  }
  const membersWith = (change: (members: string[]) => unknown): TrustCircle =>
    ({ ...circle, members: change([...circle.members]) as string[] })

  // The members are read once, by index, as a list of strings: none of the
  // list's own methods is called, so it signs over the members it holds
  it.each([
    ['an iterator of their own that throws', membersWith(members => Object.defineProperty(members, Symbol.iterator, { value: () => { throw new Error('no iterating') } }))],
    ['an iterator of their own that runs backwards', membersWith(members => Object.defineProperty(members, Symbol.iterator, { value: () => [...members].reverse()[Symbol.iterator]() }))],
    ['a map of their own', membersWith(members => Object.defineProperty(members, 'map', { value: () => [pubKeys[0]] }))],
    ['no map', membersWith(members => Object.defineProperty(members, 'map', { value: undefined }))],
    ['a kind of list that grows when it is made', membersWith((members) => {
      class Grows extends Array<string> {
        constructor(...items: unknown[]) {
          super(...(items as string[]))
          if (items.length === 1 && typeof items[0] === 'number') this.push(bytesToHex(schnorr.getPublicKey(hexToBytes('04'.repeat(32)))))
        }
      }
      return Grows.from(members)
    })],
  ])('signs over the members a list with %s holds, reading them by index', async (_name, ring) => {
    const { remote, asked } = await both(ring)

    expect(remote).toMatchObject({ ring: circle.members })
    expect(asked).toHaveLength(1)
    expect(asked[0].ring).toEqual(circle.members)
  })

  it('reads the length once, so a list that reports another length later is signed as first read', async () => {
    let reads = 0
    const shifting = new Proxy([...circle.members], {
      get: (target, key, receiver) => (key === 'length' ? (reads++ === 0 ? 3 : 1_000_000) : Reflect.get(target, key, receiver)),
    })
    const contribution = await contributeAssertionAsync({ ...circle, members: shifting }, subject, { rank: 1 }, signerFor(privKeys[0]), index(0))

    expect(contribution.signature.ring).toEqual(circle.members)
    expect(reads).toBe(1)
  })

  it.each([
    ['a hole', membersWith((members) => { delete members[1]; return members }), 'Ring member at index 1 is not a string'],
    ['a length past its members', membersWith((members) => { members.length = 4; return members }), 'Ring member at index 3 is not a string'],
    ['members that are not strings', membersWith(members => members.map(member => ({ toLowerCase: () => member.toUpperCase() }))), 'Ring member at index 0 is not a string'],
    ['a length past any ring', { ...circle, members: new Proxy([...circle.members], { get: (target, key, receiver) => (key === 'length' ? 2 ** 32 - 1 : Reflect.get(target, key, receiver)) }) }, 'Ring size 4294967295 exceeds maximum of 1000'],
  ])('turns away a list with %s before asking the signer', async (_name, ring, error) => {
    const { remote, asked } = await both(ring as TrustCircle)

    expect(remote).toEqual({ error })
    expect(asked).toHaveLength(0)
  })

  it.each(['1', 1n, new Number(1), 1.5, -1, 3, 2 ** 53])('gives the local helper\'s error for a member index of %s', async (at) => {
    const { local, remote, asked } = await both(circle, { rank: 1 }, at)

    expect('error' in local).toBe(true)
    expect(remote).toEqual(local)
    expect(asked).toHaveLength(0)
  })

  it('rejects, and never throws, from the typed helpers', () => {
    const throwing = Object.defineProperty({}, 'proofVersion', { get() { throw new Error('options getter') } })
    const calls = [
      () => contributeEventAssertionAsync(circle, eventId, { rank: 1 }, signerFor(privKeys[0]), index(0), throwing),
      () => contributeAddressableAssertionAsync(circle, address, { rank: 1 }, signerFor(privKeys[0]), index(0), throwing),
      () => contributeIdentifierAssertionAsync(circle, 'x:a', '0', { rank: 1 }, signerFor(privKeys[0]), index(0), throwing),
    ]
    return Promise.all(calls.map(async (call) => {
      let promise: Promise<unknown> | undefined
      expect(() => { promise = call() }).not.toThrow()
      await expect(promise).rejects.toThrow('options getter')
    }))
  })

  it('rejects with the signer\'s own error, from whatever kind of promise it gives', async () => {
    const declining: LsagSigner[] = [
      { lsagSign: () => { throw new Error('member declined') } },
      { lsagSign: () => Promise.reject(new Error('member declined')) },
      { lsagSign: async () => { throw new Error('member declined') } },
      { lsagSign: () => ({ then: (_resolve: unknown, reject: (error: Error) => void) => reject(new Error('member declined')) }) as never },
      { lsagSign: () => runInNewContext('Promise.reject(new Error("member declined"))') as never },
    ]
    for (const signer of declining) {
      await expect(contributeAssertionAsync(circle, subject, { rank: 1 }, signer, index(0))).rejects.toThrow('member declined')
    }
  })

  it('accepts an honest answer given by whatever kind of promise', async () => {
    const answerOf = (request: LsagSignRequest) => lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
    const honest: LsagSigner[] = [
      { lsagSign: answerOf },
      { lsagSign: request => Promise.resolve(answerOf(request)) },
      { lsagSign: async request => answerOf(request) },
      { lsagSign: request => ({ then: (resolve: (value: unknown) => void) => resolve(answerOf(request)) }) as never },
      // A promise, and an answer, from another realm
      { lsagSign: request => runInNewContext('(answer) => Promise.resolve(JSON.parse(answer))')(JSON.stringify(answerOf(request))) as never },
    ]
    for (const signer of honest) {
      const contribution = await contributeAssertionAsync(circle, subject, { rank: 1 }, signer, index(0))
      expect(contribution.signature.ring).toEqual(circle.members)
    }
  })

  // An answer that settles is read under a guard: a field that cannot be read
  // is no answer. One that cannot be settled at all is the signer's own failure.
  it('reports an answer it settles but cannot read as no LSAG signature', async () => {
    const revoked = () => {
      const { proxy, revoke } = Proxy.revocable({}, {})
      revoke()
      return proxy
    }
    const unreadable: LsagSigner = {
      lsagSign(request) {
        const signature = lsagSign(request.message, request.ring, request.signerIndex, privKeys[0], request.electionId)
        return { ...signature, responses: revoked() as never }
      },
    }

    await expect(contributeAssertionAsync(circle, subject, { rank: 1 }, unreadable, index(0)))
      .rejects.toThrow('External signer did not return an LSAG signature')
    await expect(contributeAssertionAsync(circle, subject, { rank: 1 }, { lsagSign: () => revoked() as never }, index(0)))
      .rejects.toThrow('revoked')
  })
})
