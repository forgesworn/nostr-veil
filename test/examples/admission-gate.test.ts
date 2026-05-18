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
})
