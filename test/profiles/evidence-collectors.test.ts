import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  canonicalAddressSubject,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  canonicalPackageDigestSubject,
  collectListLabelerCompanionEvidence,
  collectNip05DomainCompanionEvidence,
  collectPackageReleaseCompanionEvidence,
  fetchAddressableEventFromRelay,
  fetchNip05DocumentEvidence,
  fetchNpmPackageVersionEvidence,
  fetchOsvVulnerabilityReport,
  normaliseSbomEvidence,
  signEvent,
} from '../../src/index.js'
import type { SignedEvent } from '../../src/index.js'
import type {
  EvidenceFetch,
  EvidenceFetchInit,
  EvidenceFetchResponse,
  NostrRelayWebSocket,
  NostrRelayWebSocketConstructor,
  NostrRelayWebSocketListener,
} from '../../src/profiles/index.js'

const checkedAt = 1_778_000_000

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

function fetchFixture(routes: Record<string, EvidenceFetchResponse>): EvidenceFetch {
  return async (input: string | URL, _init?: EvidenceFetchInit) => {
    const url = String(input)
    const response = routes[url]
    if (response === undefined) {
      throw new Error(`unexpected fetch ${url}`)
    }
    return response
  }
}

class FakeRelaySocket implements NostrRelayWebSocket {
  static instances: FakeRelaySocket[] = []

  readonly listeners = new Map<string, NostrRelayWebSocketListener[]>()
  sent: string[] = []
  closed = false

  constructor(readonly url: string, readonly event: SignedEvent) {
    FakeRelaySocket.instances.push(this)
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
    this.sent.push(data)
    const request = JSON.parse(data) as unknown[]
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

function fakeWebSocketConstructor(event: SignedEvent): NostrRelayWebSocketConstructor {
  FakeRelaySocket.instances = []
  return class extends FakeRelaySocket {
    constructor(url: string) {
      super(url, event)
    }
  }
}

describe('companion evidence collectors', () => {
  it('fetches npm package metadata and derives package evidence through the resolver', async () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const fetch = fetchFixture({
      'https://registry.npmjs.org/nostr-veil': jsonResponse({
        versions: {
          '0.14.0': {
            name: 'nostr-veil',
            version: '0.14.0',
            dist: {
              integrity: 'sha512-fixture',
              shasum: 'abc123',
              tarball: 'https://registry.npmjs.org/nostr-veil/-/nostr-veil-0.14.0.tgz',
            },
          },
        },
      }),
      'https://sbom.example.com/nostr-veil-0.14.0.spdx.json': jsonResponse({
        spdxVersion: 'SPDX-2.3',
        name: 'nostr-veil',
        versionInfo: '0.14.0',
      }),
      'https://api.osv.dev/v1/query': jsonResponse({ vulns: [] }),
    })

    const metadata = await fetchNpmPackageVersionEvidence('nostr-veil', '0.14.0', { fetch })
    const osv = await fetchOsvVulnerabilityReport(subject, { fetch })
    const evidence = await collectPackageReleaseCompanionEvidence({
      checkedAt,
      fetch,
      osv: true,
      sbomUrl: 'https://sbom.example.com/nostr-veil-0.14.0.spdx.json',
      subject,
      verifyProvenance: packageVersion =>
        packageVersion.dist?.integrity === 'sha512-fixture',
    })

    expect(metadata.dist?.integrity).toBe('sha512-fixture')
    expect(osv).toMatchObject({ ok: true, subject, vulnerabilities: [] })
    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['npm-provenance', 'pass'],
      ['sbom', 'pass'],
      ['vulnerability-feed', 'pass'],
    ])
  })

  it('normalises SPDX and CycloneDX SBOM documents without claiming package safety', () => {
    expect(normaliseSbomEvidence({
      spdxVersion: 'SPDX-2.3',
      packages: [{ name: 'nostr-veil', versionInfo: '0.14.0' }],
    })).toEqual({
      format: 'spdx',
      packageName: 'nostr-veil',
      version: '0.14.0',
    })

    expect(normaliseSbomEvidence({
      bomFormat: 'CycloneDX',
      metadata: { component: { name: 'nostr-veil', version: '0.14.0' } },
    }, canonicalNpmPackageSubject('nostr-veil', '0.14.0'))).toEqual({
      format: 'cyclonedx',
      packageName: 'nostr-veil',
      subject: 'npm:nostr-veil@0.14.0',
      version: '0.14.0',
    })
  })

  it('fetches NIP-05 and HTTPS observations before resolving provider evidence', async () => {
    const subject = canonicalNip05Subject('alice@example.com')
    const pubkey = 'aa'.repeat(32)
    const fetch = fetchFixture({
      'https://example.com/.well-known/nostr.json?name=alice': jsonResponse({
        names: { alice: pubkey },
      }),
    })

    const document = await fetchNip05DocumentEvidence(subject, { fetch })
    const evidence = await collectNip05DomainCompanionEvidence({
      checkedAt,
      checkDnsOwner: domain => domain === 'example.com',
      expectedPubkey: pubkey,
      fetch,
      subject,
    })

    expect(document.names.alice).toBe(pubkey)
    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['nip05-resolution', 'pass'],
      ['https-probe', 'pass'],
      ['dns-owner-check', 'pass'],
    ])
  })

  it('fetches an addressable list event from a relay and resolves list evidence', async () => {
    const author = key('44')
    const subject = canonicalAddressSubject(30000, author.pub, 'trusted-relays')
    const listEvent = signEvent({
      content: '',
      created_at: checkedAt,
      kind: 30000,
      tags: [
        ['d', 'trusted-relays'],
        ['relay', 'wss://relay.example.com'],
      ],
    }, author.priv)
    const WebSocket = fakeWebSocketConstructor(listEvent)
    const fetched = await fetchAddressableEventFromRelay({
      WebSocket,
      relayUrl: 'wss://relay.example.com',
      subject,
      timeoutMs: 1_000,
    })
    const fetch = fetchFixture({
      'https://labels.example.com/corrections': textResponse('ok'),
    })
    const evidence = await collectListLabelerCompanionEvidence({
      checkedAt,
      correctionChannel: 'https://labels.example.com/corrections',
      fetch,
      relayUrl: 'wss://relay.example.com',
      sampleReview: { reviewedItems: 3, requiredItems: 2 },
      subject,
      timeoutMs: 1_000,
      WebSocket,
    })

    expect(fetched?.id).toBe(listEvent.id)
    expect(FakeRelaySocket.instances[0].sent[0]).toContain('"REQ"')
    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['list-revision-fetch', 'pass'],
      ['sample-review', 'pass'],
      ['correction-channel', 'pass'],
    ])
  })

  it('fails closed when package collection cannot prove provenance or safety feeds', async () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const fetch = fetchFixture({
      'https://registry.npmjs.org/nostr-veil': jsonResponse({
        versions: {
          '0.14.0': {
            name: 'nostr-veil',
            version: '0.14.0',
            dist: { integrity: 'sha512-fixture' },
          },
        },
      }),
    })

    const evidence = await collectPackageReleaseCompanionEvidence({
      checkedAt,
      fetch,
      subject,
    })

    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['npm-provenance', 'fail'],
      ['sbom', 'fail'],
      ['vulnerability-feed', 'fail'],
    ])
  })

  it('fails vulnerability evidence when OSV reports any finding for the package subject', async () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const fetch = fetchFixture({
      'https://registry.npmjs.org/nostr-veil': jsonResponse({
        versions: {
          '0.14.0': {
            name: 'nostr-veil',
            provenance: { verified: true },
            version: '0.14.0',
            dist: { integrity: 'sha512-fixture' },
          },
        },
      }),
      'https://api.osv.dev/v1/query': jsonResponse({
        vulns: [{ id: 'GHSA-fixture', severity: [{ type: 'CVSS_V3', score: 'HIGH' }] }],
      }),
    })

    const evidence = await collectPackageReleaseCompanionEvidence({
      checkedAt,
      fetch,
      osv: true,
      sbom: { packageName: 'nostr-veil', version: '0.14.0' },
      subject,
    })

    expect(evidence.find(item => item.id === 'npm-provenance')?.status).toBe('pass')
    expect(evidence.find(item => item.id === 'sbom')?.status).toBe('pass')
    expect(evidence.find(item => item.id === 'vulnerability-feed')?.status).toBe('fail')
  })

  it('does not upgrade package-level SBOM JSON into digest-bound SBOM evidence', async () => {
    const digest = 'a1'.repeat(32)
    const subject = canonicalPackageDigestSubject('npm', 'nostr-veil', '0.14.0', 'sha256', digest)
    const fetch = fetchFixture({
      'https://registry.npmjs.org/nostr-veil': jsonResponse({
        versions: {
          '0.14.0': {
            name: 'nostr-veil',
            provenance: { verified: true },
            version: '0.14.0',
            dist: { integrity: 'sha512-fixture' },
          },
        },
      }),
      'https://sbom.example.com/nostr-veil-0.14.0.spdx.json': jsonResponse({
        spdxVersion: 'SPDX-2.3',
        packages: [{ name: 'nostr-veil', versionInfo: '0.14.0' }],
      }),
      'https://api.osv.dev/v1/query': jsonResponse({ vulns: [] }),
    })

    const evidence = await collectPackageReleaseCompanionEvidence({
      artefactDigest: { algorithm: 'sha256', digest },
      checkedAt,
      fetch,
      osv: true,
      sbomUrl: 'https://sbom.example.com/nostr-veil-0.14.0.spdx.json',
      subject,
    })

    expect(evidence.find(item => item.id === 'npm-provenance')?.status).toBe('pass')
    expect(evidence.find(item => item.id === 'sbom')?.status).toBe('fail')
    expect(evidence.find(item => item.id === 'vulnerability-feed')?.status).toBe('pass')
  })
})
