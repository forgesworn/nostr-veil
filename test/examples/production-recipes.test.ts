import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function runRecipes(): string {
  return execFileSync('npm', ['run', 'test:production-recipes'], {
    cwd: root,
    encoding: 'utf8',
  })
}

describe('production recipes', () => {
  it('covers the supported roadmap expansion gates with concrete verifier actions', { timeout: 30_000 }, () => {
    const output = runRecipes()

    expect(output).toContain('package-release-gate: valid=yes')
    expect(output).toContain('action=surface-reviewed-release')
    expect(output).toContain('evidence=npm-provenance,sbom,vulnerability-feed')
    expect(output).toContain('nip05-domain-warning: valid=yes')
    expect(output).toContain('action=show-provider-trust-signal')
    expect(output).toContain('evidence=nip05-resolution,https-probe,dns-owner-check')
    expect(output).toContain('list-labeler-selection: valid=yes')
    expect(output).toContain('action=prefer-curation-source')
    expect(output).toContain('evidence=list-revision-fetch,sample-review,correction-channel')
  })

  it('keeps every recipe signed and profile-definition clean', { timeout: 30_000 }, () => {
    const output = runRecipes()

    expect(output).not.toContain('valid=no')
    expect(output).not.toContain('errors=')
    expect(output).toMatch(/^package-release-gate: .* profileWarnings=0$/m)
    expect(output).toMatch(/^nip05-domain-warning: .* profileWarnings=0$/m)
    expect(output).toMatch(/^list-labeler-selection: .* profileWarnings=0$/m)
  })
})
