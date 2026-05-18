/**
 * Opt-in companion-evidence smoke test.
 *
 * The default dry run uses deterministic fixtures and is safe for CI:
 *   npm run test:companion-evidence
 *
 * Live mode exercises real fetch/WebSocket paths. Package gates may fail
 * closed unless a real provenance source and SBOM URL are supplied:
 *   npm run test:companion-evidence:live -- --sbom-url https://example.com/sbom.json
 *
 * Refresh the public evidence file from the deterministic dry run:
 *   npm run test:companion-evidence -- --write docs/companion-evidence-checks.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  canonicalAddressSubject,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  collectListLabelerCompanionEvidence,
  collectNip05DomainCompanionEvidence,
  collectPackageReleaseCompanionEvidence,
} from 'nostr-veil/profiles'
import { signEvent } from 'nostr-veil'
import type {
  CompanionEvidence,
  EvidenceFetch,
  EvidenceFetchInit,
  EvidenceFetchResponse,
  NostrRelayWebSocket,
  NostrRelayWebSocketConstructor,
  NostrRelayWebSocketListener,
} from 'nostr-veil/profiles'
import type { SignedEvent } from 'nostr-veil'

declare const process: {
  argv: string[]
  env: Record<string, string | undefined>
  exitCode?: number
}

const args = process.argv.slice(2)
const DEFAULT_RELAY = 'wss://relay.trotters.cc'
const DEFAULT_NIP05 = 'jack@primal.net'
const checkedAt = Math.floor(Date.now() / 1000)

type ReportMode = 'fixture-dry-run' | 'live'
type SmokeStatus = 'pass' | 'fail'

interface EvidenceItemReport {
  checkedAt?: number
  id: string
  status: SmokeStatus
  summary?: string
}

interface CompanionEvidenceUseCaseReport {
  checks: Record<string, boolean>
  evidence: EvidenceItemReport[]
  slug: string
  status: SmokeStatus
  subject: string
}

interface CompanionEvidenceReport {
  checkedAt: string
  command: string
  mode: ReportMode
  relay: string
  summary: {
    failed: number
    passed: number
    useCases: number
  }
  useCases: CompanionEvidenceUseCaseReport[]
  version: 1
}

function optionValue(name: string): string | undefined {
  const inline = args.find(arg => arg.startsWith(`${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 1)

  const index = args.indexOf(name)
  if (index === -1) return undefined

  return args[index + 1]
}

function hasFlag(name: string): boolean {
  return args.includes(name)
}

function mode(): ReportMode {
  return hasFlag('--live') ? 'live' : 'fixture-dry-run'
}

function relayUrl(): string {
  return optionValue('--relay')
    ?? args.find(arg => arg.startsWith('wss://'))
    ?? process.env.NOSTR_VEIL_LIVE_RELAY
    ?? DEFAULT_RELAY
}

async function packageVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: string
  }
  if (packageJson.version === undefined) throw new Error('package.json is missing version')
  return optionValue('--package-version') ?? packageJson.version
}

function key(byte: string): { priv: string, pub: string } {
  const priv = byte.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
}

function jsonResponse(value: unknown, options: { ok?: boolean, status?: number } = {}): EvidenceFetchResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify(value)).buffer
    },
    async json() {
      return value
    },
    async text() {
      return JSON.stringify(value)
    },
  }
}

function textResponse(value: string, options: { ok?: boolean, status?: number } = {}): EvidenceFetchResponse {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async arrayBuffer() {
      return new TextEncoder().encode(value).buffer
    },
    async json() {
      return JSON.parse(value)
    },
    async text() {
      return value
    },
  }
}

function fixtureFetch(routes: Record<string, EvidenceFetchResponse>): EvidenceFetch {
  return async (input: string | URL, _init?: EvidenceFetchInit) => {
    const response = routes[String(input)]
    if (response === undefined) throw new Error(`unexpected companion evidence fetch ${String(input)}`)
    return response
  }
}

class FixtureRelaySocket implements NostrRelayWebSocket {
  readonly listeners = new Map<string, NostrRelayWebSocketListener[]>()
  closed = false

  constructor(readonly url: string, readonly event: SignedEvent) {
    queueMicrotask(() => this.emit('open', {}))
  }

  addEventListener(type: string, listener: NostrRelayWebSocketListener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.closed = true
  }

  send(data: string): void {
    const request = JSON.parse(data) as unknown[]
    if (request[0] !== 'REQ') return

    const subscriptionId = typeof request[1] === 'string' ? request[1] : 'sub'
    queueMicrotask(() => {
      this.emit('message', { data: JSON.stringify(['EVENT', subscriptionId, this.event]) })
      this.emit('message', { data: JSON.stringify(['EOSE', subscriptionId]) })
    })
  }

  emit(type: string, event: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

function fixtureWebSocket(event: SignedEvent): NostrRelayWebSocketConstructor {
  return class extends FixtureRelaySocket {
    constructor(url: string) {
      super(url, event)
    }
  }
}

function websocketCtor(): typeof WebSocket {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is required for live relay checks. Use Node 22+ or pass --dry-run.')
  }
  return WebSocket
}

function relayMessage(raw: unknown): unknown[] | undefined {
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

async function publishEvent(relay: string, event: SignedEvent): Promise<boolean> {
  const WebSocketImpl = websocketCtor()

  return new Promise((resolve, reject) => {
    let settled = false
    const ws = new WebSocketImpl(relay)
    const finish = (accepted: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ws.close()
      resolve(accepted)
    }
    const timeout = setTimeout(() => finish(false), 30_000)

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(['EVENT', event]))
    })
    ws.addEventListener('message', (message) => {
      const data = relayMessage(message.data)
      if (data?.[0] === 'OK' && data[1] === event.id) {
        finish(data[2] === true)
      }
    })
    ws.addEventListener('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ws.close()
      reject(new Error(`WebSocket error while publishing companion evidence event to ${relay}`))
    })
    ws.addEventListener('close', () => finish(false))
  })
}

function evidenceReport(evidence: readonly CompanionEvidence[]): EvidenceItemReport[] {
  return evidence.map(item => ({
    ...(item.checkedAt === undefined ? {} : { checkedAt: item.checkedAt }),
    id: item.id,
    status: item.status,
    ...(item.summary === undefined ? {} : { summary: item.summary }),
  }))
}

function useCaseReport(
  slug: string,
  subject: string,
  evidence: readonly CompanionEvidence[],
  checks: Record<string, boolean>,
): CompanionEvidenceUseCaseReport {
  const status = evidence.every(item => item.status === 'pass') && Object.values(checks).every(Boolean)
    ? 'pass'
    : 'fail'
  return {
    checks,
    evidence: evidenceReport(evidence),
    slug,
    status,
    subject,
  }
}

async function packageEvidence(currentMode: ReportMode): Promise<CompanionEvidenceUseCaseReport> {
  const name = optionValue('--package') ?? 'nostr-veil'
  const version = await packageVersion()
  const subject = canonicalNpmPackageSubject(name, version)
  const sbomUrl = optionValue('--sbom-url')
  const fetch = currentMode === 'fixture-dry-run'
    ? fixtureFetch({
        [`https://registry.npmjs.org/${name}`]: jsonResponse({
          versions: {
            [version]: {
              dist: { integrity: 'sha512-fixture' },
              name,
              version,
            },
          },
        }),
        'https://api.osv.dev/v1/query': jsonResponse({ vulns: [] }),
        'https://sbom.example.com/nostr-veil.spdx.json': jsonResponse({
          spdxVersion: 'SPDX-2.3',
          packages: [{ name, versionInfo: version }],
        }),
      })
    : undefined
  const evidence = await collectPackageReleaseCompanionEvidence({
    checkedAt,
    fetch,
    osv: true,
    ...(currentMode === 'fixture-dry-run'
      ? { sbomUrl: 'https://sbom.example.com/nostr-veil.spdx.json' }
      : sbomUrl === undefined
        ? {}
        : { sbomUrl }),
    subject,
    verifyProvenance: packageVersion =>
      currentMode === 'fixture-dry-run'
        ? packageVersion.dist?.integrity === 'sha512-fixture'
        : packageVersion.provenance ?? false,
  })

  return useCaseReport('release-package-maintainer-reputation', subject, evidence, {
    collectorReturnedAllEvidence: evidence.length === 3,
    failClosedWhenControlsMissing: currentMode === 'fixture-dry-run' || evidence.some(item => item.status === 'fail'),
  })
}

async function nip05Evidence(currentMode: ReportMode): Promise<CompanionEvidenceUseCaseReport> {
  const identifier = optionValue('--nip05') ?? DEFAULT_NIP05
  const subject = canonicalNip05Subject(identifier)
  const [, domain] = subject.slice('nip05:'.length).split('@')
  const fixturePubkey = 'aa'.repeat(32)
  const fetch = currentMode === 'fixture-dry-run'
    ? fixtureFetch({
        [`https://${domain}/.well-known/nostr.json?name=${subject.slice('nip05:'.length).split('@')[0]}`]: jsonResponse({
          names: { [subject.slice('nip05:'.length).split('@')[0]]: fixturePubkey },
        }),
      })
    : undefined
  const evidence = await collectNip05DomainCompanionEvidence({
    checkedAt,
    checkDnsOwner: checkedDomain => checkedDomain === domain,
    ...(currentMode === 'fixture-dry-run' ? { expectedPubkey: fixturePubkey } : {}),
    fetch,
    subject,
  })

  return useCaseReport('nip05-domain-service-provider-trust', subject, evidence, {
    collectorReturnedAllEvidence: evidence.length === 3,
    resolverFetchedCurrentDocument: evidence.some(item => item.id === 'nip05-resolution'),
  })
}

function listEventFor(subjectDTag: string): SignedEvent {
  const author = key('66')
  return signEvent({
    content: '',
    created_at: checkedAt,
    kind: 30000,
    tags: [
      ['d', subjectDTag],
      ['relay', 'wss://relay.trotters.cc'],
      ['name', 'nostr-veil companion evidence smoke test'],
    ],
  }, author.priv)
}

async function listEvidence(currentMode: ReportMode, relay: string): Promise<CompanionEvidenceUseCaseReport> {
  const dTag = currentMode === 'fixture-dry-run'
    ? 'companion-evidence-fixture'
    : `companion-evidence-${checkedAt}`
  const event = listEventFor(dTag)
  const subject = canonicalAddressSubject(event.kind, event.pubkey, dTag)
  const fetch = currentMode === 'fixture-dry-run'
    ? fixtureFetch({ 'https://labels.example.com/corrections': textResponse('ok') })
    : undefined
  const WebSocket = currentMode === 'fixture-dry-run' ? fixtureWebSocket(event) : undefined
  const published = currentMode === 'fixture-dry-run' ? true : await publishEvent(relay, event)
  const evidence = await collectListLabelerCompanionEvidence({
    checkedAt,
    correctionChannel: currentMode === 'fixture-dry-run'
      ? 'https://labels.example.com/corrections'
      : 'https://github.com/forgesworn/nostr-veil/issues',
    fetch,
    relayUrl: relay,
    sampleReview: { reviewedItems: 3, requiredItems: 2 },
    subject,
    timeoutMs: 30_000,
    WebSocket,
  })

  return useCaseReport('list-labeler-moderation-list-reputation', subject, evidence, {
    collectorReturnedAllEvidence: evidence.length === 3,
    relayEventPublished: published,
  })
}

async function buildReport(): Promise<CompanionEvidenceReport> {
  const currentMode = mode()
  const relay = relayUrl()
  const useCases = [
    await packageEvidence(currentMode),
    await nip05Evidence(currentMode),
    await listEvidence(currentMode, relay),
  ]

  return {
    checkedAt: new Date(checkedAt * 1000).toISOString(),
    command: currentMode === 'fixture-dry-run'
      ? 'npm run test:companion-evidence'
      : 'npm run test:companion-evidence:live',
    mode: currentMode,
    relay,
    summary: {
      failed: useCases.filter(useCase => useCase.status === 'fail').length,
      passed: useCases.filter(useCase => useCase.status === 'pass').length,
      useCases: useCases.length,
    },
    useCases,
    version: 1,
  }
}

const report = await buildReport()

for (const useCase of report.useCases) {
  console.log(`${useCase.slug}: status=${useCase.status} subject=${useCase.subject} evidence=${useCase.evidence.map(item => `${item.id}:${item.status}`).join(',')}`)
}
console.log(`summary: ${report.summary.passed}/${report.summary.useCases} companion evidence checks passed (${report.mode})`)

const writePath = optionValue('--write')
if (writePath !== undefined) {
  await writeFile(writePath, `${JSON.stringify(report, null, 2)}\n`)
}

if (report.summary.failed > 0) {
  process.exitCode = 1
}
