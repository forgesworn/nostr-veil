import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = path.join(root, 'docs', 'use-case-pages')
const examplesDir = path.join(root, 'examples', 'use-cases')
const publicDir = path.join(root, 'demo', 'public', 'use-cases')

const cases = [
  {
    slug: 'user-reputation-abuse-reporting',
    file: 'user-reputation-abuse-reporting.md',
    group: 'People',
    status: 'Supported today',
  },
  {
    slug: 'privacy-preserving-onboarding',
    file: 'privacy-preserving-onboarding.md',
    group: 'People',
    status: 'Supported today',
  },
  {
    slug: 'source-corroboration',
    file: 'source-corroboration.md',
    group: 'Content',
    status: 'Supported today',
  },
  {
    slug: 'event-claim-verification',
    file: 'event-claim-verification.md',
    group: 'Content',
    status: 'Supported today',
  },
  {
    slug: 'article-research-review',
    file: 'article-research-review.md',
    group: 'Content',
    status: 'Supported today',
  },
  {
    slug: 'relay-service-reputation',
    file: 'relay-service-reputation.md',
    group: 'Infrastructure',
    status: 'Supported today',
  },
  {
    slug: 'nip05-domain-service-provider-trust',
    file: 'nip05-domain-service-provider-trust.md',
    group: 'Infrastructure',
    status: 'Supported today',
  },
  {
    slug: 'list-labeler-moderation-list-reputation',
    file: 'list-labeler-moderation-list-reputation.md',
    group: 'Infrastructure',
    status: 'Supported today',
  },
  {
    slug: 'release-package-maintainer-reputation',
    file: 'release-package-maintainer-reputation.md',
    group: 'Infrastructure',
    status: 'Supported today',
  },
  {
    slug: 'vendor-marketplace-signals',
    file: 'vendor-marketplace-signals.md',
    group: 'Markets',
    status: 'Supported today',
  },
  {
    slug: 'federated-moderation',
    file: 'federated-moderation.md',
    group: 'Governance',
    status: 'Supported today',
  },
  {
    slug: 'grant-funding-proposal-review',
    file: 'grant-funding-proposal-review.md',
    group: 'Governance',
    status: 'Supported today',
  },
  {
    slug: 'anonymous-credential-attestation-cosigning',
    file: 'anonymous-credential-attestation-cosigning.md',
    group: 'Future profiles',
    status: 'Profile needed',
  },
  {
    slug: 'relay-community-admission',
    file: 'relay-community-admission.md',
    group: 'Future profiles',
    status: 'Profile needed',
  },
]

const caseByDoc = new Map(cases.map((useCase) => [useCase.file, useCase]))

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inlineMarkdown(value) {
  let text = escapeHtml(value)
  text = text.replace(/\[([^\]]+)\]\(\.\/([^)]+)\)/g, (_match, label, href) => {
    const target = caseByDoc.get(href)
    if (!target) return label
    return `<a href="../${target.slug}/">${label}</a>`
  })
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return text
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => inlineMarkdown(cell.trim()))
}

function renderTable(lines) {
  const header = splitTableRow(lines[0])
  const rows = lines.slice(2).map(splitTableRow)
  return `<div class="table-wrap"><table><thead><tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`
}

function collectList(lines, start, ordered) {
  const marker = ordered ? /^\d+\.\s+(.*)$/ : /^-\s+(.*)$/
  const otherMarker = ordered ? /^-\s+/ : /^\d+\.\s+/
  const items = []
  let i = start

  while (i < lines.length) {
    const match = lines[i].match(marker)
    if (!match) break

    let item = match[1].trim()
    i += 1

    while (i < lines.length) {
      const line = lines[i]
      if (line.trim() === '') break
      if (marker.test(line) || otherMarker.test(line) || line.startsWith('#') || line.startsWith('|') || line.startsWith('```')) break
      item += ` ${line.trim()}`
      i += 1
    }

    items.push(item)
  }

  const tag = ordered ? 'ol' : 'ul'
  return {
    html: `<${tag}>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`,
    next: i,
  }
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/)
  const html = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i += 1
      continue
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i])
        i += 1
      }
      i += 1
      html.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    if (line.startsWith('## ')) {
      html.push(`<h2>${inlineMarkdown(line.slice(3).trim())}</h2>`)
      i += 1
      continue
    }

    if (line.startsWith('### ')) {
      html.push(`<h3>${inlineMarkdown(line.slice(4).trim())}</h3>`)
      i += 1
      continue
    }

    if (line.startsWith('|')) {
      const table = []
      while (i < lines.length && lines[i].startsWith('|')) {
        table.push(lines[i])
        i += 1
      }
      html.push(renderTable(table))
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const list = collectList(lines, i, true)
      html.push(list.html)
      i = list.next
      continue
    }

    if (/^-\s+/.test(line)) {
      const list = collectList(lines, i, false)
      html.push(list.html)
      i = list.next
      continue
    }

    const paragraph = [line.trim()]
    i += 1
    while (i < lines.length) {
      const next = lines[i]
      if (
        next.trim() === '' ||
        next.startsWith('#') ||
        next.startsWith('|') ||
        next.startsWith('```') ||
        /^-\s+/.test(next) ||
        /^\d+\.\s+/.test(next)
      ) {
        break
      }
      paragraph.push(next.trim())
      i += 1
    }

    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
  }

  return html.join('\n')
}

function extractTitle(markdown) {
  return markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? 'Use case'
}

function extractIntro(markdown) {
  const withoutTitle = markdown.replace(/^#\s+.+\n+/, '')
  const beforeFit = withoutTitle.split(/^##\s+Fit$/m)[0] ?? ''
  return beforeFit
    .trim()
    .split(/\n\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
}

function stripTitle(markdown) {
  return markdown.replace(/^#\s+.+\n+/, '').trim()
}

async function includeExecutableExamples(markdown) {
  const exampleRefs = [...markdown.matchAll(/<!--\s*use-case-example:\s*([a-z0-9-]+)\s*-->/g)]
  let rendered = markdown

  for (const match of exampleRefs) {
    const slug = match[1]
    const examplePath = path.join(examplesDir, `${slug}.ts`)
    const source = (await readFile(examplePath, 'utf8')).trimEnd()
    rendered = rendered.replace(match[0], `\`\`\`ts\n${source}\n\`\`\``)
  }

  return rendered
}

function statusClass(status) {
  return status === 'Profile needed' ? 'future' : 'today'
}

function renderNav(activeSlug) {
  return cases
    .map((useCase) => {
      const active = useCase.slug === activeSlug ? ' aria-current="page"' : ''
      return `<a href="../${useCase.slug}/"${active}>${escapeHtml(useCase.title)}</a>`
    })
    .join('\n')
}

function renderPage(useCase, index) {
  const previous = cases[(index - 1 + cases.length) % cases.length]
  const next = cases[(index + 1) % cases.length]
  const body = renderMarkdown(stripTitle(useCase.markdown))
  const intro = inlineMarkdown(useCase.intro)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(useCase.title)} | nostr-veil use cases</title>
  <meta name="description" content="${escapeHtml(useCase.intro)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(useCase.title)}" />
  <meta property="og:description" content="${escapeHtml(useCase.intro)}" />
  <meta property="og:image" content="https://raw.githubusercontent.com/forgesworn/nostr-veil/main/social-preview.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='9' fill='none' stroke='%2340c7aa' stroke-width='3'/></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #111820;
      --ink-2: #2b3844;
      --muted: #627180;
      --paper: #f7f8f5;
      --paper-2: #eef2ed;
      --white: #ffffff;
      --line: #d9e0db;
      --line-strong: #b7c4bc;
      --dark: #07100f;
      --dark-line: #213238;
      --mint: #40c7aa;
      --mint-dark: #0e7462;
      --blue: #3d6fd9;
      --shadow: 0 24px 70px rgba(17, 24, 32, 0.14);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      min-height: 100vh;
      background:
        linear-gradient(rgba(17, 24, 32, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(17, 24, 32, 0.035) 1px, transparent 1px),
        var(--paper);
      background-size: 36px 36px, 36px 36px, auto;
      color: var(--ink);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.62;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; text-underline-offset: 3px; }
    code, pre, .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
    .wrap { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
    .eyebrow {
      color: var(--mint-dark);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(247, 248, 245, 0.9);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(18px);
    }
    .nav-shell {
      height: 66px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 14px;
      font-weight: 800;
    }
    .brand-mark {
      width: 24px;
      height: 24px;
      border: 1px solid var(--ink);
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--dark);
    }
    .brand-mark::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mint);
      box-shadow: 0 0 18px rgba(64, 199, 170, 0.7);
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 20px;
      color: var(--ink-2);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 800;
    }
    .nav a:hover { color: var(--mint-dark); text-decoration: none; }
    .nav .install {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0 13px;
      color: var(--white);
      background: var(--ink);
    }
    .hero {
      color: var(--white);
      background: linear-gradient(135deg, var(--dark), #0b1319 58%, #12161c);
      border-bottom: 1px solid var(--dark-line);
    }
    .hero-inner {
      min-height: 430px;
      display: grid;
      grid-template-columns: minmax(0, 0.72fr) minmax(280px, 0.34fr);
      gap: 54px;
      align-items: end;
      padding: 64px 0 58px;
    }
    .hero h1 {
      max-width: 12ch;
      margin-top: 16px;
      font-size: clamp(42px, 6.4vw, 82px);
      line-height: 0.96;
      letter-spacing: 0;
    }
    .hero p {
      max-width: 66ch;
      margin-top: 22px;
      color: #c7d2d9;
      font-size: clamp(17px, 1.8vw, 20px);
    }
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 30px;
    }
    .button {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--dark-line);
      border-radius: 999px;
      padding: 0 15px;
      background: rgba(255,255,255,0.06);
      color: var(--white);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .button:hover { border-color: var(--mint); color: var(--mint); text-decoration: none; }
    .button.primary { background: var(--mint); border-color: var(--mint); color: #031412; }
    .button.primary:hover { color: #031412; background: #6be0c9; }
    .status-panel {
      border: 1px solid var(--dark-line);
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      padding: 20px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-radius: 999px;
      padding: 0 10px;
      border: 1px solid rgba(255,255,255,0.16);
      color: var(--white);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .status-pill.today { background: rgba(64, 199, 170, 0.18); color: #a7f1e0; }
    .status-pill.future { background: rgba(243, 178, 75, 0.18); color: #ffd58b; }
    .status-panel dl {
      display: grid;
      gap: 14px;
      margin-top: 20px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
    }
    .status-panel dt { color: #879ca6; text-transform: uppercase; letter-spacing: 0.08em; }
    .status-panel dd { margin-top: 3px; color: #e6eef2; }
    .layout {
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr);
      gap: 42px;
      align-items: start;
      padding: 74px 0;
    }
    .hero-inner > *,
    .layout > *,
    .next-grid > * {
      min-width: 0;
    }
    .side-nav {
      position: sticky;
      top: 88px;
      display: grid;
      gap: 6px;
      border-left: 3px solid var(--ink);
      padding-left: 14px;
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
      font-weight: 800;
    }
    .side-nav a {
      min-height: 30px;
      display: flex;
      align-items: center;
      color: var(--muted);
    }
    .side-nav a[aria-current="page"] { color: var(--ink); }
    .side-nav a:hover { color: var(--mint-dark); text-decoration: none; }
    article {
      max-width: 880px;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--white);
      box-shadow: var(--shadow);
      padding: clamp(24px, 4vw, 46px);
    }
    article h2 {
      scroll-margin-top: 88px;
      margin-top: 42px;
      padding-top: 34px;
      border-top: 1px solid var(--line);
      font-size: clamp(26px, 3vw, 36px);
      line-height: 1.08;
      letter-spacing: 0;
    }
    article h2:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    article h3 {
      margin-top: 26px;
      font-size: 21px;
      line-height: 1.2;
    }
    article p,
    article li {
      color: var(--ink-2);
      font-size: 16px;
    }
    article p { margin-top: 16px; }
    article ul,
    article ol {
      display: grid;
      gap: 10px;
      margin: 16px 0 0 1.25rem;
    }
    article code {
      border: 1px solid var(--line);
      border-radius: 5px;
      background: var(--paper-2);
      padding: 0.08rem 0.28rem;
      color: var(--mint-dark);
      font-size: 0.92em;
      overflow-wrap: anywhere;
    }
    pre {
      max-width: 100%;
      margin-top: 18px;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #07100f;
      padding: 20px;
      color: #e8f4f1;
      font-size: 13px;
      line-height: 1.62;
    }
    pre code {
      border: 0;
      background: transparent;
      padding: 0;
      color: inherit;
      font-size: inherit;
    }
    .table-wrap {
      max-width: 100%;
      margin-top: 18px;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table {
      width: 100%;
      min-width: 640px;
      border-collapse: collapse;
      font-size: 14px;
    }
    th,
    td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
    }
    th {
      background: var(--paper-2);
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    tr:last-child td { border-bottom: 0; }
    td { color: var(--ink-2); }
    .next-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 28px;
    }
    .next-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      padding: 18px;
    }
    .next-card span {
      color: var(--muted);
      font-family: "JetBrains Mono", ui-monospace, monospace;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .next-card strong {
      display: block;
      margin-top: 8px;
      line-height: 1.25;
    }
    footer {
      color: var(--white);
      background: var(--dark);
      border-top: 1px solid var(--dark-line);
      padding: 42px 0;
    }
    footer p { color: #b7c5cc; }
    @media (max-width: 980px) {
      .hero-inner,
      .layout { grid-template-columns: 1fr; }
      .side-nav {
        position: static;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        border-left: 0;
        border-top: 3px solid var(--ink);
        padding: 14px 0 0;
      }
    }
    @media (max-width: 680px) {
      html, body { overflow-x: hidden; }
      .wrap { width: calc(100vw - 28px); }
      h1, h2, h3, p, li, a, span, code { overflow-wrap: anywhere; }
      .nav a:not(.install) { display: none; }
      .hero-inner { min-height: auto; gap: 24px; padding: 34px 0 30px; }
      .button { width: 100%; }
      .layout { padding: 52px 0; gap: 28px; }
      article { order: 1; padding: 22px; }
      .side-nav { order: 2; }
      .side-nav,
      .next-grid { grid-template-columns: 1fr; }
      table { min-width: 560px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap nav-shell">
      <a class="brand" href="../../" aria-label="nostr-veil demo">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>nostr-veil</span>
      </a>
      <nav class="nav" aria-label="Primary">
        <a href="../">Use cases</a>
        <a href="https://github.com/forgesworn/nostr-veil">GitHub</a>
        <a class="install" href="https://www.npmjs.com/package/nostr-veil">npm</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="wrap hero-inner">
        <div>
          <span class="eyebrow">${escapeHtml(useCase.group)}</span>
          <h1>${escapeHtml(useCase.title)}</h1>
          <p>${intro}</p>
          <div class="button-row">
            <a class="button primary" href="#worked-example">Jump to worked example</a>
            <a class="button" href="../">Back to atlas</a>
          </div>
        </div>
        <aside class="status-panel" aria-label="Use-case status">
          <span class="status-pill ${statusClass(useCase.status)}">${escapeHtml(useCase.status)}</span>
          <dl>
            <div>
              <dt>Includes</dt>
              <dd>Fit, recipe, proof checks, and controls</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>${escapeHtml(useCase.group)}</dd>
            </div>
            <div>
              <dt>Pages</dt>
              <dd>${cases.length} worked examples</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>

    <div class="wrap layout">
      <nav class="side-nav" aria-label="All use cases">
        ${renderNav(useCase.slug)}
      </nav>
      <article>
        ${body.replace('<h2>Worked example', '<h2 id="worked-example">Worked example')}
        <h2>Next examples</h2>
        <div class="next-grid">
          <a class="next-card" href="../${previous.slug}/">
            <span>Previous</span>
            <strong>${escapeHtml(previous.title)}</strong>
          </a>
          <a class="next-card" href="../${next.slug}/">
            <span>Next</span>
            <strong>${escapeHtml(next.title)}</strong>
          </a>
        </div>
      </article>
    </div>
  </main>

  <footer>
    <div class="wrap">
      <p>nostr-veil: verifiable threshold-backed trust scores without naming the contributors.</p>
    </div>
  </footer>
</body>
</html>
`
}

await mkdir(publicDir, { recursive: true })

for (const useCase of cases) {
  const markdown = await readFile(path.join(docsDir, useCase.file), 'utf8')
  useCase.markdown = await includeExecutableExamples(markdown)
  useCase.title = extractTitle(markdown)
  useCase.intro = extractIntro(markdown)
}

for (const useCase of cases) {
  const outDir = path.join(publicDir, useCase.slug)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'index.html'), renderPage(useCase, cases.indexOf(useCase)))
}

console.log(`Generated ${cases.length} use-case pages in ${path.relative(root, publicDir)}`)
