import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { aggregateContributions, contributeAssertion, createTrustCircle } from '../src/index.js'
import type { AggregateName, ProofVerification } from '../src/index.js'

// The binary imports the built library, so these tests need `npm run build` first, as the example tests do

const members = ['11', '22', '33'].map(byte => {
  const priv = byte.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
})
const circle = createTrustCircle(members.map(member => member.pub))
const subject = 'dd'.repeat(32)

/** Three scores of 20, 20 and 95, published under the named aggregate. */
function published(aggregate: AggregateName): string {
  const contributions = [20, 20, 95].map((rank, index) => contributeAssertion(
    circle,
    subject,
    { rank },
    members[index].priv,
    circle.members.indexOf(members[index].pub),
    { proofVersion: 'v2' },
  ))
  return JSON.stringify(aggregateContributions(circle, subject, contributions, { aggregate }))
}

function cli(...args: string[]): { result: ProofVerification; status: number | null; stderr: string; stdout: string } {
  const run = spawnSync(process.execPath, ['bin/cli.js', ...args], { cwd: process.cwd(), encoding: 'utf8' })
  let result = {} as ProofVerification
  try {
    result = JSON.parse(run.stdout) as ProofVerification
  } catch {
    // Not every invocation prints JSON
  }
  return { result, status: run.status, stderr: run.stderr, stdout: run.stdout }
}

describe('nostr-veil verify --aggregate', () => {
  const asMax = published('max')

  it('accepts whichever aggregate the event names when none is required', () => {
    const { result, status } = cli('verify', asMax)

    expect(status).toBe(0)
    expect(result.valid).toBe(true)
  })

  it('rejects an event published under another aggregate than the one required', () => {
    const { result, status } = cli('verify', asMax, '--aggregate', 'median')

    expect(status).toBe(0)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['veil-agg is "max" but "median" is required'])
    expect(result.distinctSigners).toBe(3)
  })

  it('accepts the event under the aggregate it names', () => {
    expect(cli('verify', asMax, '--aggregate', 'max').result.valid).toBe(true)
    expect(cli('verify', published('median'), '--aggregate', 'median').result.valid).toBe(true)
  })

  it('combines with --kind in either order', () => {
    expect(cli('verify', asMax, '--kind', '30382', '--aggregate', 'max').result.valid).toBe(true)
    expect(cli('verify', asMax, '--aggregate', 'max', '--kind', '30382').result.valid).toBe(true)

    const wrongKind = cli('verify', asMax, '--aggregate', 'max', '--kind', '30383').result
    expect(wrongKind.valid).toBe(false)
  })

  it('refuses a name that is not a built-in aggregate', () => {
    for (const name of ['mode', 'custom', 'MEDIAN', '', 'toString']) {
      const { status, stderr, stdout } = cli('verify', asMax, '--aggregate', name)

      expect(status, name).toBe(1)
      expect(stderr, name).toContain('Error: --aggregate must be one of median, mean, sum, min or max')
      expect(stdout, name).toBe('')
    }
  })

  it('refuses the flag with no value', () => {
    const { status, stderr } = cli('verify', asMax, '--aggregate')

    expect(status).toBe(1)
    expect(stderr).toContain('Error: --aggregate must be one of median, mean, sum, min or max')
  })

  it('lists the flag in the usage text', () => {
    const { status, stdout } = cli('--help')

    expect(status).toBe(0)
    expect(stdout).toContain('[--aggregate fn]')
  })
})
