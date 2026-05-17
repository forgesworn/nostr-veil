/**
 * Opt-in live relay check for the canonical use-case examples.
 *
 * It signs every executable use-case assertion as a real Nostr event, publishes
 * those events to a relay, fetches them back by id, and re-verifies the proof
 * material that came back from the relay.
 *
 * Run without network side effects:
 *   npm run test:use-cases:relay -- --dry-run
 *
 * Run against the demo relay and refresh the public evidence file:
 *   npm run test:use-cases:relay -- --write docs/use-case-relay-checks.json
 */
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  computeEventId,
  signEvent,
  validateAssertionStrict,
  verifyFederation,
  verifyProof,
} from 'nostr-veil'
import type { EventTemplate, SignedEvent } from 'nostr-veil'
import { useCaseResults } from './use-cases/_all.js'
import { proofVersion } from './use-cases/_shared.js'
import type { UseCaseResult } from './use-cases/_shared.js'

declare const process: {
  argv: string[]
  env: Record<string, string | undefined>
  exitCode?: number
}

const DEFAULT_RELAY = 'wss://relay.trotters.cc'
const TEXT_ENCODER = new TextEncoder()
const args = process.argv.slice(2)

interface PublishResult {
  accepted: boolean
  message: string
}

interface PreparedUseCase {
  slug: string
  localProofValid: boolean
  templates: EventTemplate[]
  signedEvents: SignedEvent[]
}

interface RelayProofSummary {
  valid: boolean
  distinctSigners: number
  threshold?: number
  circleSize?: number
  circleCount?: number
  totalSignatures?: number
  errors: string[]
}

interface RelayUseCaseReport {
  slug: string
  status: 'pass' | 'fail'
  eventIds: string[]
  events: number
  accepted: number
  fetched: number
  checks: {
    localExample: boolean
    relayStored: boolean
    nostrSignature: boolean
    canonicalTags: boolean
    syntax: boolean
    proof: boolean
  }
  proof: RelayProofSummary
  publishMessages: string[]
}

interface RelayReport {
  version: 1
  relay: string
  checkedAt: string
  runId: string
  mode: 'live-relay'
  command: string
  summary: {
    useCases: number
    events: number
    passed: number
    failed: number
  }
  useCases: RelayUseCaseReport[]
}

function optionValue(name: string): string | undefined {
  const inline = args.find(arg => arg.startsWith(`${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 1)

  const index = args.indexOf(name)
  if (index === -1) return undefined

  return args[index + 1]
}

function relayUrl(): string {
  return optionValue('--relay')
    ?? args.find(arg => arg.startsWith('wss://'))
    ?? process.env.NOSTR_VEIL_LIVE_RELAY
    ?? DEFAULT_RELAY
}

function websocketCtor(): typeof WebSocket {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is required. Use Node 22+ or a runtime with WebSocket support.')
  }
  return WebSocket
}

function sha256Hex(value: string): string {
  return bytesToHex(sha256(TEXT_ENCODER.encode(value)))
}

function privateKeyFor(slug: string, eventIndex: number): string {
  return sha256Hex(`nostr-veil:live-use-case-relay-publisher:${slug}:${eventIndex}`)
}

function runIdFor(checkedAtUnix: number): string {
  return `${checkedAtUnix.toString(36)}-${sha256Hex(String(checkedAtUnix)).slice(0, 10)}`
}

function isAssertionResult(result: UseCaseResult): result is UseCaseResult & { assertion: EventTemplate } {
  return 'assertion' in result
}

function templatesFor(result: UseCaseResult): EventTemplate[] {
  return isAssertionResult(result) ? [result.assertion] : result.events
}

function cloneTags(tags: string[][]): string[][] {
  return tags.map(tag => [...tag])
}

function relayTemplate(
  template: EventTemplate,
  slug: string,
  eventIndex: number,
  checkedAtUnix: number,
  runId: string,
): EventTemplate {
  return {
    kind: template.kind,
    tags: cloneTags(template.tags),
    content: JSON.stringify({
      fixture: 'nostr-veil/use-cases',
      slug,
      eventIndex,
      runId,
    }),
    created_at: checkedAtUnix,
  }
}

function prepareUseCases(checkedAtUnix: number, runId: string): PreparedUseCase[] {
  return useCaseResults.map((result) => {
    const templates = templatesFor(result)
    const signedEvents = templates.map((template, index) =>
      signEvent(relayTemplate(template, result.slug, index, checkedAtUnix, runId), privateKeyFor(result.slug, index)),
    )

    return {
      slug: result.slug,
      localProofValid: result.proof.valid,
      templates,
      signedEvents,
    }
  })
}

function parseRelayMessage(raw: unknown): unknown[] | null {
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function publishEvents(relay: string, events: SignedEvent[]): Promise<Map<string, PublishResult>> {
  const WebSocketImpl = websocketCtor()
  const pending = new Set(events.map(event => event.id))
  const results = new Map<string, PublishResult>(
    events.map(event => [event.id, { accepted: false, message: 'No OK response from relay' }]),
  )

  return new Promise((resolve, reject) => {
    let settled = false
    const ws = new WebSocketImpl(relay)

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ws.close()
      resolve(results)
    }

    const timeout = setTimeout(finish, 30_000)

    ws.addEventListener('open', () => {
      for (const event of events) {
        ws.send(JSON.stringify(['EVENT', event]))
      }
    })

    ws.addEventListener('message', (message) => {
      const data = parseRelayMessage(message.data)
      if (data?.[0] !== 'OK') return

      const id = data[1]
      if (typeof id !== 'string' || !pending.has(id)) return

      const accepted = data[2] === true
      const reason = typeof data[3] === 'string' ? data[3] : ''
      results.set(id, { accepted, message: reason })
      pending.delete(id)

      if (pending.size === 0) finish()
    })

    ws.addEventListener('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`WebSocket error while publishing to ${relay}`))
    })

    ws.addEventListener('close', () => {
      if (settled) return
      finish()
    })
  })
}

async function fetchEvents(relay: string, ids: string[]): Promise<Map<string, SignedEvent>> {
  const WebSocketImpl = websocketCtor()
  const subscriptionId = `nostr-veil-use-cases-${Date.now()}`
  const wanted = new Set(ids)
  const events = new Map<string, SignedEvent>()

  return new Promise((resolve, reject) => {
    let settled = false
    const ws = new WebSocketImpl(relay)

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      ws.send(JSON.stringify(['CLOSE', subscriptionId]))
      ws.close()
      resolve(events)
    }

    const timeout = setTimeout(finish, 30_000)

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(['REQ', subscriptionId, { ids }]))
    })

    ws.addEventListener('message', (message) => {
      const data = parseRelayMessage(message.data)
      if (data?.[0] === 'EVENT' && data[1] === subscriptionId && isSignedEvent(data[2])) {
        if (wanted.has(data[2].id)) {
          events.set(data[2].id, data[2])
          if (events.size === wanted.size) finish()
        }
        return
      }

      if (data?.[0] === 'EOSE' && data[1] === subscriptionId) {
        finish()
      }
    })

    ws.addEventListener('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`WebSocket error while fetching from ${relay}`))
    })

    ws.addEventListener('close', () => {
      if (settled) return
      finish()
    })
  })
}

function isSignedEvent(value: unknown): value is SignedEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<SignedEvent>
  return typeof event.id === 'string'
    && typeof event.pubkey === 'string'
    && typeof event.created_at === 'number'
    && typeof event.kind === 'number'
    && Array.isArray(event.tags)
    && typeof event.content === 'string'
    && typeof event.sig === 'string'
}

function verifyNostrSignature(event: SignedEvent): boolean {
  if (computeEventId(event) !== event.id) return false
  try {
    return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey))
  } catch {
    return false
  }
}

function tagsMatch(template: EventTemplate, event: SignedEvent): boolean {
  return template.kind === event.kind && JSON.stringify(template.tags) === JSON.stringify(event.tags)
}

function assertionProof(events: SignedEvent[]): RelayProofSummary {
  const proof = verifyProof(events[0], { requireProofVersion: proofVersion })
  return {
    valid: proof.valid,
    distinctSigners: proof.distinctSigners,
    threshold: proof.threshold,
    circleSize: proof.circleSize,
    errors: proof.errors,
  }
}

function federationProof(events: SignedEvent[]): RelayProofSummary {
  const proof = verifyFederation(events)
  return {
    valid: proof.valid,
    distinctSigners: proof.distinctSigners,
    circleCount: proof.circleCount,
    totalSignatures: proof.totalSignatures,
    errors: proof.errors,
  }
}

function proofFor(result: UseCaseResult, events: SignedEvent[]): RelayProofSummary {
  return isAssertionResult(result) ? assertionProof(events) : federationProof(events)
}

function reportForUseCase(
  result: UseCaseResult,
  prepared: PreparedUseCase,
  publishResults: Map<string, PublishResult>,
  fetchedEvents: Map<string, SignedEvent>,
): RelayUseCaseReport {
  const fetched = prepared.signedEvents
    .map(event => fetchedEvents.get(event.id))
    .filter((event): event is SignedEvent => event !== undefined)
  const proof = fetched.length === prepared.signedEvents.length
    ? proofFor(result, fetched)
    : { valid: false, distinctSigners: 0, errors: ['Not all events were fetched back from the relay'] }
  const syntax = fetched.every(event => validateAssertionStrict(event).valid)
  const checks = {
    localExample: prepared.localProofValid,
    relayStored: fetched.length === prepared.signedEvents.length,
    nostrSignature: fetched.every(verifyNostrSignature),
    canonicalTags: fetched.every((event, index) => tagsMatch(prepared.templates[index], event)),
    syntax,
    proof: proof.valid,
  }
  const status = Object.values(checks).every(Boolean) ? 'pass' : 'fail'
  const publishMessages = prepared.signedEvents
    .map(event => publishResults.get(event.id)?.message ?? '')
    .filter(Boolean)

  return {
    slug: prepared.slug,
    status,
    eventIds: prepared.signedEvents.map(event => event.id),
    events: prepared.signedEvents.length,
    accepted: prepared.signedEvents.filter(event => publishResults.get(event.id)?.accepted === true).length,
    fetched: fetched.length,
    checks,
    proof,
    publishMessages,
  }
}

function buildReport(
  relay: string,
  checkedAt: string,
  runId: string,
  reports: RelayUseCaseReport[],
): RelayReport {
  return {
    version: 1,
    relay,
    checkedAt,
    runId,
    mode: 'live-relay',
    command: 'npm run test:use-cases:relay -- --write docs/use-case-relay-checks.json',
    summary: {
      useCases: reports.length,
      events: reports.reduce((sum, report) => sum + report.events, 0),
      passed: reports.filter(report => report.status === 'pass').length,
      failed: reports.filter(report => report.status === 'fail').length,
    },
    useCases: reports,
  }
}

async function writeReport(pathname: string, report: RelayReport): Promise<void> {
  // @ts-ignore Node types are intentionally optional for this runner.
  const { mkdir, writeFile } = await import('node:fs/promises') as {
    mkdir: (path: string, options: { recursive: true }) => Promise<void>
    writeFile: (path: string, data: string) => Promise<void>
  }
  const separatorIndex = Math.max(pathname.lastIndexOf('/'), pathname.lastIndexOf('\\'))
  const dir = separatorIndex === -1 ? '.' : pathname.slice(0, separatorIndex)
  await mkdir(dir, { recursive: true })
  await writeFile(pathname, `${JSON.stringify(report, null, 2)}\n`)
}

function printDryRun(prepared: PreparedUseCase[]): void {
  for (const useCase of prepared) {
    const signaturesValid = useCase.signedEvents.every(verifyNostrSignature)
    const tagsValid = useCase.signedEvents.every((event, index) => tagsMatch(useCase.templates[index], event))
    const proofValid = useCase.signedEvents.length === 1
      ? assertionProof(useCase.signedEvents).valid
      : federationProof(useCase.signedEvents).valid
    console.log(`${useCase.slug}: local=${useCase.localProofValid ? 'yes' : 'no'} signed=${signaturesValid ? 'yes' : 'no'} tags=${tagsValid ? 'yes' : 'no'} proof=${proofValid ? 'yes' : 'no'}`)
  }
}

async function main(): Promise<void> {
  const checkedAtUnix = Math.floor(Date.now() / 1000)
  const checkedAt = new Date(checkedAtUnix * 1000).toISOString()
  const runId = runIdFor(checkedAtUnix)
  const prepared = prepareUseCases(checkedAtUnix, runId)
  const dryRun = args.includes('--dry-run')

  if (dryRun) {
    printDryRun(prepared)
    return
  }

  const relay = relayUrl()
  const allEvents = prepared.flatMap(useCase => useCase.signedEvents)
  const publishResults = await publishEvents(relay, allEvents)
  const fetchedEvents = await fetchEvents(relay, allEvents.map(event => event.id))
  const reports = useCaseResults.map((result, index) =>
    reportForUseCase(result, prepared[index], publishResults, fetchedEvents),
  )
  const report = buildReport(relay, checkedAt, runId, reports)

  for (const useCase of report.useCases) {
    console.log(`${useCase.slug}: relay=${useCase.status === 'pass' ? 'yes' : 'no'} accepted=${useCase.accepted}/${useCase.events} fetched=${useCase.fetched}/${useCase.events} proof=${useCase.proof.valid ? 'yes' : 'no'}`)
  }
  console.log(`summary: ${report.summary.passed}/${report.summary.useCases} use cases passed via ${relay}`)

  const writePath = optionValue('--write')
  if (writePath !== undefined) {
    await writeReport(writePath, report)
    console.log(`wrote ${writePath}`)
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
