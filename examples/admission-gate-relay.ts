/**
 * Opt-in live relay check for the relay/community admission gate.
 *
 * The admission vouch remains a normal NIP-85 kind 30382 user assertion. The
 * deployment bundle is carried in a separate NIP-78 kind 30078 application data
 * event only so the live test can fetch both signed objects back from a relay.
 *
 * Run without network side effects:
 *   npm run test:admission-gate:relay -- --dry-run
 *
 * Run against the demo relay and refresh the public evidence file:
 *   npm run test:admission-gate:relay -- --write docs/admission-gate-relay-check.json
 */
import {
  DEPLOYMENT_BUNDLE_TYPE,
  NIP85_KINDS,
  RELAY_COMMUNITY_ADMISSION_PROFILE,
  createAdmissionChallenge,
  createAdmissionPresentation,
  createCircleManifest,
  createDeploymentPolicy,
  createSignedDeploymentBundle,
  signEvent,
  validateAssertionStrict,
  verifyAdmissionRequest,
  verifySignedEvent,
} from 'nostr-veil'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { EventTemplate, SignedDeploymentBundle, SignedEvent } from 'nostr-veil'
import { assertion as relayAdmissionAssertion } from './use-cases/relay-community-admission.js'
import { keys, subjectPubkey } from './use-cases/_shared.js'

declare const process: {
  argv: string[]
  env: Record<string, string | undefined>
  exitCode?: number
}

const DEFAULT_RELAY = 'wss://relay.trotters.cc'
const BUNDLE_PUBLISHER_KEY = '66'.repeat(32)
const RELAY_PUBLISHER_KEY = '55'.repeat(32)
const TEXT_ENCODER = new TextEncoder()
const args = process.argv.slice(2)

interface PublishResult {
  accepted: boolean
  message: string
}

interface AdmissionRelayFixture {
  audience: string
  bundle: SignedDeploymentBundle
  bundleEvent: SignedEvent
  challenge: ReturnType<typeof createAdmissionChallenge>
  localResult: ReturnType<typeof verifyAdmissionRequest>
  presentation: ReturnType<typeof createAdmissionPresentation>
  signedVouch: SignedEvent
}

interface AdmissionRelayReport {
  version: 1
  relay: string
  checkedAt: string
  runId: string
  mode: 'live-relay-admission-gate'
  command: string
  status: 'pass' | 'fail'
  events: {
    bundleEventId: string
    bundleEventKind: number
    vouchEventId: string
    vouchKind: number
  }
  checks: {
    admissionDecision: boolean
    admissionVerification: boolean
    bundleFetched: boolean
    bundleSignature: boolean
    bundleTransportSignature: boolean
    deploymentVerification: boolean
    localAdmission: boolean
    presentationVerification: boolean
    vouchFetched: boolean
    vouchKind30382: boolean
    vouchNostrSignature: boolean
    vouchSyntax: boolean
    vouchTagsUnchanged: boolean
  }
  result: {
    applicantPubkey: string
    audience: string
    decision: string
    errors: string[]
    rank: number | null
    valid: boolean
  }
  publishMessages: string[]
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

function runIdFor(checkedAtUnix: number): string {
  return `${checkedAtUnix.toString(36)}-${sha256Hex(String(checkedAtUnix)).slice(0, 10)}`
}

function tagValue(event: EventTemplate, name: string): string {
  const value = event.tags.find(tag => tag[0] === name)?.[1]
  if (value === undefined) throw new Error(`missing ${name} tag`)
  return value
}

function cloneTags(tags: string[][]): string[][] {
  return tags.map(tag => [...tag])
}

function circleMembers(event: EventTemplate): string[] {
  const members = event.tags.find(tag => tag[0] === 'veil-ring')?.slice(1)
  if (members === undefined) throw new Error('missing veil-ring tag')
  return members
}

function relayVouchTemplate(checkedAtUnix: number, runId: string): EventTemplate {
  return {
    kind: relayAdmissionAssertion.kind,
    tags: cloneTags(relayAdmissionAssertion.tags),
    content: JSON.stringify({
      fixture: 'nostr-veil/admission-gate',
      runId,
    }),
    created_at: checkedAtUnix,
  }
}

function bundleTransportTemplate(
  bundle: SignedDeploymentBundle,
  signedVouch: SignedEvent,
  relay: string,
  checkedAtUnix: number,
  runId: string,
): EventTemplate {
  return {
    kind: 30078,
    tags: [
      ['d', bundle.id],
      ['application', 'nostr-veil'],
      ['type', DEPLOYMENT_BUNDLE_TYPE],
      ['profile', RELAY_COMMUNITY_ADMISSION_PROFILE.id],
      ['e', signedVouch.id],
      ['relay', relay],
      ['run', runId],
    ],
    content: JSON.stringify(bundle),
    created_at: checkedAtUnix,
  }
}

function buildFixture(relay: string, checkedAtUnix: number, runId: string): AdmissionRelayFixture {
  const signedVouch = signEvent(relayVouchTemplate(checkedAtUnix, runId), RELAY_PUBLISHER_KEY)
  const audience = `relay:${relay}`
  const manifest = createCircleManifest({
    issuedAt: checkedAtUnix,
    expiresAt: checkedAtUnix + 900,
    members: circleMembers(relayAdmissionAssertion),
    name: 'Admission reviewers',
    profileIds: [RELAY_COMMUNITY_ADMISSION_PROFILE.id],
    purpose: 'Relay admission live test',
  })
  const policy = createDeploymentPolicy(RELAY_COMMUNITY_ADMISSION_PROFILE, {
    circleManifests: [manifest],
    expectedSubject: tagValue(relayAdmissionAssertion, 'd'),
    metricPolicies: {
      rank: { required: true, min: 0, max: 100, integer: true },
    },
    rejectUnknownMetrics: true,
    requireNostrSignature: true,
  })
  const bundle = createSignedDeploymentBundle(policy, {
    expiresAt: checkedAtUnix + 900,
    id: 'relay-admission-gate-live',
    issuedAt: checkedAtUnix,
    privateKey: BUNDLE_PUBLISHER_KEY,
  })
  const challenge = createAdmissionChallenge({
    applicantPubkey: subjectPubkey,
    audience,
    expiresAt: checkedAtUnix + 120,
    issuedAt: checkedAtUnix,
  })
  const presentation = createAdmissionPresentation(challenge, keys[3].priv, {
    createdAt: checkedAtUnix + 1,
  })
  const localResult = verifyAdmissionRequest(signedVouch, bundle, challenge, presentation, {
    expectedAudience: audience,
    now: checkedAtUnix + 1,
    trustedPublishers: [bundle.signer],
  })
  const bundleEvent = signEvent(
    bundleTransportTemplate(bundle, signedVouch, relay, checkedAtUnix, runId),
    BUNDLE_PUBLISHER_KEY,
  )

  return {
    audience,
    bundle,
    bundleEvent,
    challenge,
    localResult,
    presentation,
    signedVouch,
  }
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
  const subscriptionId = `nostr-veil-admission-${Date.now()}`
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

function isSignedDeploymentBundle(value: unknown): value is SignedDeploymentBundle {
  if (typeof value !== 'object' || value === null) return false
  const bundle = value as Partial<SignedDeploymentBundle>
  return bundle.version === 1
    && bundle.type === DEPLOYMENT_BUNDLE_TYPE
    && typeof bundle.id === 'string'
    && typeof bundle.issuedAt === 'number'
    && typeof bundle.signer === 'string'
    && typeof bundle.signature === 'string'
    && typeof bundle.policy === 'object'
    && bundle.policy !== null
}

function parseBundleEvent(event: SignedEvent | undefined): SignedDeploymentBundle | undefined {
  if (event === undefined) return undefined
  try {
    const parsed = JSON.parse(event.content)
    return isSignedDeploymentBundle(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function tagsMatch(left: string[][], right: string[][]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function buildReport(
  relay: string,
  checkedAt: string,
  runId: string,
  fixture: AdmissionRelayFixture,
  publishResults: Map<string, PublishResult>,
  fetchedEvents: Map<string, SignedEvent>,
): AdmissionRelayReport {
  const fetchedVouch = fetchedEvents.get(fixture.signedVouch.id)
  const fetchedBundleEvent = fetchedEvents.get(fixture.bundleEvent.id)
  const fetchedBundle = parseBundleEvent(fetchedBundleEvent)
  const result = fetchedVouch !== undefined && fetchedBundle !== undefined
    ? verifyAdmissionRequest(fetchedVouch, fetchedBundle, fixture.challenge, fixture.presentation, {
      expectedAudience: fixture.audience,
      now: fixture.signedVouch.created_at + 1,
      trustedPublishers: [fixture.bundle.signer],
    })
    : undefined
  const checks = {
    admissionDecision: result?.decision === 'admit',
    admissionVerification: result?.valid === true,
    bundleFetched: fetchedBundleEvent !== undefined,
    bundleSignature: result?.deployment.bundle.signatureValid === true,
    bundleTransportSignature: fetchedBundleEvent !== undefined && verifySignedEvent(fetchedBundleEvent),
    deploymentVerification: result?.deployment.valid === true,
    localAdmission: fixture.localResult.valid,
    presentationVerification: result?.presentation.valid === true,
    vouchFetched: fetchedVouch !== undefined,
    vouchKind30382: fetchedVouch?.kind === NIP85_KINDS.USER,
    vouchNostrSignature: fetchedVouch !== undefined && verifySignedEvent(fetchedVouch),
    vouchSyntax: fetchedVouch !== undefined && validateAssertionStrict(fetchedVouch).valid,
    vouchTagsUnchanged: fetchedVouch !== undefined && tagsMatch(relayAdmissionAssertion.tags, fetchedVouch.tags),
  }
  const status = Object.values(checks).every(Boolean) ? 'pass' : 'fail'
  const publishMessages = [fixture.signedVouch, fixture.bundleEvent]
    .map(event => publishResults.get(event.id)?.message ?? '')
    .filter(Boolean)

  return {
    version: 1,
    relay,
    checkedAt,
    runId,
    mode: 'live-relay-admission-gate',
    command: 'npm run test:admission-gate:relay -- --write docs/admission-gate-relay-check.json',
    status,
    events: {
      bundleEventId: fixture.bundleEvent.id,
      bundleEventKind: fixture.bundleEvent.kind,
      vouchEventId: fixture.signedVouch.id,
      vouchKind: fixture.signedVouch.kind,
    },
    checks,
    result: {
      applicantPubkey: result?.applicantPubkey ?? fixture.presentation.applicantPubkey,
      audience: fixture.audience,
      decision: result?.decision ?? 'deny',
      errors: result?.errors ?? ['admission vouch or deployment bundle was not fetched back from the relay'],
      rank: result?.rank ?? null,
      valid: result?.valid ?? false,
    },
    publishMessages,
  }
}

async function writeReport(pathname: string, report: AdmissionRelayReport): Promise<void> {
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

function printDryRun(fixture: AdmissionRelayFixture): void {
  const signed = verifySignedEvent(fixture.signedVouch) && verifySignedEvent(fixture.bundleEvent)
  const vouchTagsUnchanged = tagsMatch(relayAdmissionAssertion.tags, fixture.signedVouch.tags)
  console.log(
    `admission-gate-relay: local=${fixture.localResult.valid ? 'yes' : 'no'} signed=${signed ? 'yes' : 'no'} vouch-kind=${fixture.signedVouch.kind} bundle-kind=${fixture.bundleEvent.kind} tags=${vouchTagsUnchanged ? 'yes' : 'no'} admission=${fixture.localResult.decision}`,
  )
}

async function main(): Promise<void> {
  const checkedAtUnix = Math.floor(Date.now() / 1000)
  const checkedAt = new Date(checkedAtUnix * 1000).toISOString()
  const relay = relayUrl()
  const runId = runIdFor(checkedAtUnix)
  const fixture = buildFixture(relay, checkedAtUnix, runId)

  if (args.includes('--dry-run')) {
    printDryRun(fixture)
    return
  }

  const publishResults = await publishEvents(relay, [fixture.signedVouch, fixture.bundleEvent])
  const fetchedEvents = await fetchEvents(relay, [fixture.signedVouch.id, fixture.bundleEvent.id])
  const report = buildReport(relay, checkedAt, runId, fixture, publishResults, fetchedEvents)

  console.log(
    `admission-gate-relay: relay=${report.status === 'pass' ? 'yes' : 'no'} vouch=${report.checks.vouchFetched ? 'yes' : 'no'} bundle=${report.checks.bundleFetched ? 'yes' : 'no'} decision=${report.result.decision} rank=${report.result.rank ?? 'missing'}`,
  )
  console.log(`events: vouch=${report.events.vouchEventId} bundle=${report.events.bundleEventId}`)

  const writePath = optionValue('--write')
  if (writePath !== undefined) {
    await writeReport(writePath, report)
    console.log(`wrote ${writePath}`)
  }

  if (report.status === 'fail') {
    console.log(`errors=${report.result.errors.join('; ')}`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
