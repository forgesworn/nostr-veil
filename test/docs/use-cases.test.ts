import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const docsDir = join(root, 'docs/use-case-pages')
const exampleDir = join(root, 'examples/use-cases')
const publicUseCasesDir = join(root, 'demo/public/use-cases')

const readText = (path: string) => readFileSync(path, 'utf8')
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

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
      expect(page, `${slug} page does not render the executable example`).toContain(escapeHtml(resultLine!))
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
