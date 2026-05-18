import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('admission gate example', () => {
  it('runs the additive relay/community admission reference flow', { timeout: 30_000 }, () => {
    const output = execFileSync('npm', ['run', 'test:admission-gate'], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(output).toContain('admission-gate: valid=yes')
    expect(output).toContain('decision=admit')
    expect(output).toContain('kind=30382')
  })

  it('dry-runs the live relay admission gate without publishing', { timeout: 30_000 }, () => {
    const output = execFileSync('npm', ['run', 'test:admission-gate:relay', '--', '--dry-run'], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(output).toContain('admission-gate-relay: local=yes signed=yes')
    expect(output).toContain('vouch-kind=30382')
    expect(output).toContain('bundle-kind=30078')
    expect(output).toContain('tags=yes')
    expect(output).toContain('admission=admit')
  })
})
