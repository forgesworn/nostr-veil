import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const docsDir = join(root, 'docs/use-case-pages')
const exampleDir = join(root, 'examples/use-cases')
const relayChecksPath = join(root, 'docs/use-case-relay-checks.json')
const publicUseCasesDir = join(root, 'demo/public/use-cases')

const readText = (path: string) => readFileSync(path, 'utf8')
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const stripTokenSpans = (value: string) =>
  value.replace(/<span class="tok-[^"]+">([^<]*)<\/span>/g, '$1')

const slugs = readdirSync(docsDir)
  .filter(file => file.endsWith('.md'))
  .map(file => basename(file, '.md'))
  .sort()

const detailPagePaths = slugs.map(slug => join(publicUseCasesDir, slug, 'index.html'))
const publicPagePaths = [join(publicUseCasesDir, 'index.html'), ...detailPagePaths]
const requiredImplementationSections = [
  'Subject design',
  'What to publish',
  'What to verify',
  'What not to claim',
  'Failure handling',
]

describe('public use-case pages', () => {
  it('publishes a generated detail page for every use-case source', () => {
    expect(slugs).toHaveLength(14)

    for (const pagePath of detailPagePaths) {
      expect(existsSync(pagePath), pagePath).toBe(true)
    }
  })

  it('links the atlas to local worked examples instead of Markdown sources', () => {
    const atlas = readText(join(publicUseCasesDir, 'index.html'))

    for (const slug of slugs) {
      expect(atlas).toContain(`href="./${slug}/"`)
    }

    for (const pagePath of publicPagePaths) {
      expect(readText(pagePath), pagePath).not.toMatch(/href="[^"]+\.md"/)
    }
  })

  it('keeps internal positioning notes out of public pages', () => {
    const internalTerms = /\b(?:PAS|PRINCE|Recall|recall\.trotters|sales|storytelling|positioning)\b/i

    for (const pagePath of publicPagePaths) {
      expect(readText(pagePath), pagePath).not.toMatch(internalTerms)
    }
  })

  it('keeps generated detail pages usable with sticky headers and mobile layouts', () => {
    for (const pagePath of detailPagePaths) {
      const page = readText(pagePath)

      expect(page).toContain('scroll-margin-top: 88px;')
      expect(page).toContain('html, body { overflow-x: hidden; }')
      expect(page).toContain('article { order: 1; padding: 22px; }')
      expect(page).toContain('.side-nav { order: 2; }')
    }
  })

  it('publishes implementation sections on every generated detail page', () => {
    for (const pagePath of detailPagePaths) {
      const page = readText(pagePath)

      for (const section of requiredImplementationSections) {
        expect(page, `${pagePath} is missing ${section}`).toContain(`<h2>${section}</h2>`)
      }
    }
  })

  it('renders worked examples from the executable example files', () => {
    for (const slug of slugs) {
      const page = readText(join(publicUseCasesDir, slug, 'index.html'))
      const example = readText(join(exampleDir, `${slug}.ts`))
      const resultLine = example.split('\n').find(line => line.startsWith('export const result'))

      expect(page).not.toContain('use-case-example:')
      expect(resultLine, `${slug} executable example has no exported result`).toBeDefined()
      expect(stripTokenSpans(page), `${slug} page does not render the executable example`).toContain(
        escapeHtml(resultLine!),
      )
    }
  })

  it('syntax highlights executable TypeScript examples', () => {
    for (const pagePath of detailPagePaths) {
      const page = readText(pagePath)

      expect(page, pagePath).toContain('class="language-ts"')
      expect(page, pagePath).toContain('<span class="tok-keyword">import</span>')
      expect(page, pagePath).toContain('<span class="tok-keyword">export</span>')
      expect(page, pagePath).toContain('class="tok-string"')
      expect(page, pagePath).toContain('class="tok-fn"')
    }
  })

  it('links worked examples to their canonical runnable source', () => {
    for (const slug of slugs) {
      const page = readText(join(publicUseCasesDir, slug, 'index.html'))

      expect(page, slug).toContain(`data-example-slug="${slug}"`)
      expect(page, slug).toContain(
        `href="https://github.com/forgesworn/nostr-veil/blob/main/examples/use-cases/${slug}.ts"`,
      )
      expect(page, slug).toContain(
        'href="https://github.com/forgesworn/nostr-veil/blob/main/examples/use-cases/_shared.ts"',
      )
      expect(page, slug).toContain('data-copy-code')
    }
  })

  it('publishes live relay evidence for every worked example', () => {
    const report = JSON.parse(readText(relayChecksPath)) as {
      relay: string
      checkedAt: string
      summary: { useCases: number, passed: number }
      useCases: Array<{ slug: string, status: string, eventIds: string[], checks: { profile: boolean } }>
    }

    expect(report.relay).toBe('wss://relay.trotters.cc')
    expect(report.summary.useCases).toBe(14)
    expect(report.summary.passed).toBe(14)
    expect(Number.isNaN(Date.parse(report.checkedAt))).toBe(false)

    for (const slug of slugs) {
      const check = report.useCases.find(useCase => useCase.slug === slug)
      const page = readText(join(publicUseCasesDir, slug, 'index.html'))

      expect(check, `${slug} is missing live relay evidence`).toBeDefined()
      expect(check?.status, slug).toBe('pass')
      expect(check?.checks.profile, slug).toBe(true)
      expect(check?.eventIds.every(id => /^[0-9a-f]{64}$/.test(id)), slug).toBe(true)
      expect(page, slug).toContain('<h2>Live relay test</h2>')
      expect(page, slug).toContain('wss://relay.trotters.cc')
      expect(page, slug).toContain('Deployment profile verifier passes')
      expect(page, slug).toContain(check!.eventIds[0].slice(0, 12))
    }
  })

  it('publishes the adversarial safety matrix on every worked example', () => {
    const requiredChecks = [
      'Tampered metric',
      'Wrong subject',
      'Proof downgrade',
      'Duplicate signer',
      'Unknown circle',
      'Relay mutation',
      'verifyUseCaseProfile()',
    ]

    for (const slug of slugs) {
      const page = readText(join(publicUseCasesDir, slug, 'index.html'))

      expect(page, slug).toContain('<h2>Safety checks</h2>')
      for (const check of requiredChecks) {
        expect(page, `${slug} is missing ${check}`).toContain(check)
      }
    }
  })
})

describe('use-case source pages', () => {
  it('answers the implementation questions developers need on every page', () => {
    for (const slug of slugs) {
      const page = readText(join(docsDir, `${slug}.md`))

      for (const section of requiredImplementationSections) {
        expect(page, `${slug} is missing ${section}`).toContain(`## ${section}`)
      }
    }
  })

  it('references one canonical executable example per use case', () => {
    for (const slug of slugs) {
      const page = readText(join(docsDir, `${slug}.md`))
      const examplePath = join(exampleDir, `${slug}.ts`)

      expect(page, `${slug} does not include its executable example`).toContain(
        `<!-- use-case-example: ${slug} -->`,
      )
      expect(existsSync(examplePath), `${slug} executable example is missing`).toBe(true)
    }
  })
})

describe('executable use-case examples', () => {
  it('runs the canonical use-case examples', { timeout: 30_000 }, () => {
    const output = execFileSync('npx', ['tsx', join(root, 'examples/use-cases.ts')], {
      cwd: root,
      encoding: 'utf8',
    })

    for (const slug of slugs) {
      expect(output).toContain(`${slug}: proof=yes`)
    }
  })

  it('dry-runs the live relay harness without publishing', { timeout: 30_000 }, () => {
    const output = execFileSync('npx', ['tsx', join(root, 'examples/use-cases-relay.ts'), '--dry-run'], {
      cwd: root,
      encoding: 'utf8',
    })

    for (const slug of slugs) {
      expect(output).toContain(`${slug}: local=yes signed=yes`)
      expect(output).toContain(`${slug}: local=yes signed=yes tags=yes proof=yes profile=yes`)
    }
  })
})

describe('demo use-case generation scripts', () => {
  it('regenerates pages before local dev and production builds', () => {
    const packageJson = JSON.parse(readText(join(root, 'demo/package.json'))) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['build:use-cases']).toBe('node ../scripts/build-use-case-pages.mjs')
    expect(packageJson.scripts.prebuild).toBe('npm run build:use-cases')
    expect(packageJson.scripts.predev).toBe('npm run build:use-cases')
  })
})
