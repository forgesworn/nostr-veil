import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const roadmapPath = join(root, 'docs/internal/future-use-case-delivery-roadmap.md')
const readText = (path: string) => readFileSync(path, 'utf8')

describe('internal future use-case roadmap', () => {
  it('keeps future-profile delivery planning explicit but away from public use-case navigation', () => {
    expect(existsSync(roadmapPath)).toBe(true)

    const roadmap = readText(roadmapPath)
    expect(roadmap).toContain('Internal planning note')
    expect(roadmap).toContain('## Promotion gates')
    expect(roadmap).toContain('## Milestone ledger')
    expect(roadmap).toContain('Supported expansion hardening')
    expect(roadmap).toContain('Anonymous credential or attestation co-signing')
    expect(roadmap).toContain('Relay or community admission')

    const publicEntryPoints = [
      join(root, 'README.md'),
      join(root, 'docs/use-cases.md'),
      join(root, 'demo/public/use-cases/index.html'),
    ]

    for (const entryPoint of publicEntryPoints) {
      expect(readText(entryPoint), entryPoint).not.toContain('future-use-case-delivery-roadmap')
    }
  })
})
