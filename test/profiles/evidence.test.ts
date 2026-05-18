import { describe, expect, it } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import {
  LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE,
  NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE,
  RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE,
  canonicalAddressSubject,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  createDeploymentPolicy,
  createTrustCircle,
  aggregateAddressableContributions,
  aggregateIdentifierContributions,
  contributeAddressableAssertion,
  contributeIdentifierAssertion,
  listLabelerCompanionEvidenceRequirements,
  nip05DomainCompanionEvidenceRequirements,
  packageReleaseCompanionEvidenceRequirements,
  resolveListLabelerCompanionEvidence,
  resolveNip05DomainCompanionEvidence,
  resolvePackageReleaseCompanionEvidence,
  signEvent,
  verifyDeploymentPolicy,
} from '../../src/index.js'

const checkedAt = 1_778_000_000
function key(byte: string): { priv: string, pub: string } {
  const priv = byte.repeat(32)
  return { priv, pub: bytesToHex(schnorr.getPublicKey(hexToBytes(priv))) }
}

const members = [key('11'), key('22'), key('33')]
const listAuthor = key('44')
const externalProfileKind = '0'

function circleAssertion(subject: string) {
  const circle = createTrustCircle(members.map(member => member.pub))
  const contributions = members.map((member, index) =>
    contributeIdentifierAssertion(
      circle,
      subject,
      externalProfileKind,
      { rank: 90 + index },
      member.priv,
      circle.members.indexOf(member.pub),
      { proofVersion: 'v2' },
    ),
  )
  const assertion = aggregateIdentifierContributions(circle, subject, externalProfileKind, contributions, {
    proofVersion: 'v2',
  })

  return { assertion: { ...assertion, created_at: checkedAt }, circle }
}

function listAssertion(subject: string) {
  const circle = createTrustCircle(members.map(member => member.pub))
  const contributions = members.map((member, index) =>
    contributeAddressableAssertion(
      circle,
      subject,
      { rank: 80 + index, reaction_cnt: index + 1 },
      member.priv,
      circle.members.indexOf(member.pub),
      { proofVersion: 'v2' },
    ),
  )
  const assertion = aggregateAddressableContributions(circle, subject, contributions, { proofVersion: 'v2' })

  return { assertion: { ...assertion, created_at: checkedAt }, circle }
}

describe('companion evidence resolvers', () => {
  it('turns package registry, SBOM, and vulnerability observations into passing evidence', () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const evidence = resolvePackageReleaseCompanionEvidence({
      checkedAt,
      packageVersion: {
        dist: { integrity: 'sha512-test', tarball: 'https://registry.npmjs.org/nostr-veil/-/nostr-veil-0.14.0.tgz' },
        name: 'nostr-veil',
        provenance: { verified: true },
        version: '0.14.0',
      },
      sbom: { format: 'spdx', packageName: 'nostr-veil', version: '0.14.0' },
      subject,
      vulnerabilityReport: { critical: 0, high: 0, subject },
    })

    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['npm-provenance', 'pass'],
      ['sbom', 'pass'],
      ['vulnerability-feed', 'pass'],
    ])
    expect(evidence.every(item => item.subject === subject)).toBe(true)
    expect(evidence.every(item => item.checkedAt === checkedAt)).toBe(true)
  })

  it('fails package evidence when observations are for the wrong subject or unsafe release state', () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const evidence = resolvePackageReleaseCompanionEvidence({
      checkedAt,
      packageVersion: {
        dist: {},
        name: 'other-package',
        provenance: { verified: false },
        version: '9.9.9',
      },
      sbom: { format: 'spdx', packageName: 'other-package', version: '9.9.9' },
      subject,
      vulnerabilityReport: { critical: 1, high: 0, subject: canonicalNpmPackageSubject('other-package', '9.9.9') },
    })

    expect(evidence.every(item => item.status === 'fail')).toBe(true)
    expect(evidence.map(item => item.summary).join(' ')).toContain('subject')
  })

  it('requires the observed artefact digest for digest-bound package subjects', () => {
    const digest = 'a1'.repeat(32)
    const subject = `package-digest:${canonicalNpmPackageSubject('nostr-veil', '0.14.0')}:sha256:${digest}`
    const base = {
      checkedAt,
      packageVersion: {
        dist: { integrity: 'sha512-test' },
        name: 'nostr-veil',
        provenance: { verified: true },
        version: '0.14.0',
      },
      sbom: { format: 'spdx', subject },
      subject,
      vulnerabilityReport: { critical: 0, high: 0, subject },
    }

    const matching = resolvePackageReleaseCompanionEvidence({
      ...base,
      artefactDigest: { algorithm: 'sha256', digest },
    })
    const mismatched = resolvePackageReleaseCompanionEvidence({
      ...base,
      artefactDigest: { algorithm: 'sha256', digest: 'b2'.repeat(32) },
    })

    expect(matching.map(item => [item.id, item.status])).toEqual([
      ['npm-provenance', 'pass'],
      ['sbom', 'pass'],
      ['vulnerability-feed', 'pass'],
    ])
    expect(mismatched.find(item => item.id === 'npm-provenance')?.status).toBe('fail')
    expect(mismatched.find(item => item.id === 'sbom')?.status).toBe('pass')
  })

  it('returns failing evidence instead of throwing on malformed resolver observations', () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const packageEvidence = resolvePackageReleaseCompanionEvidence({
      checkedAt,
      packageVersion: {
        name: 'bad package name',
        provenance: { verified: true },
        version: '0.14.0',
      },
      sbom: { format: 'spdx', packageName: 'bad package name', version: '0.14.0' },
      subject,
      vulnerabilityReport: { critical: 0, high: 0, subject },
    })
    const domainEvidence = resolveNip05DomainCompanionEvidence({
      checkedAt,
      dnsOwnerCheck: { domain: 'bad domain', matched: true },
      httpsProbe: { ok: true, url: 'not a url' },
      nip05Document: { names: { alice: 'not-a-pubkey' } },
      subject: canonicalNip05Subject('alice@example.com'),
    })

    expect(packageEvidence.every(item => item.status === 'fail')).toBe(true)
    expect(domainEvidence.every(item => item.status === 'fail')).toBe(true)
  })

  it('turns NIP-05, HTTPS, and DNS observations into passing evidence', () => {
    const subject = canonicalNip05Subject('alice@example.com')
    const pubkey = 'aa'.repeat(32)
    const evidence = resolveNip05DomainCompanionEvidence({
      checkedAt,
      dnsOwnerCheck: { domain: 'example.com', matched: true },
      expectedPubkey: pubkey,
      httpsProbe: { ok: true, status: 200, url: 'https://example.com/.well-known/nostr.json?name=alice' },
      nip05Document: { names: { alice: pubkey } },
      subject,
    })

    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['nip05-resolution', 'pass'],
      ['https-probe', 'pass'],
      ['dns-owner-check', 'pass'],
    ])
  })

  it('fails NIP-05/domain evidence when the resolver output does not match the subject', () => {
    const subject = canonicalNip05Subject('alice@example.com')
    const evidence = resolveNip05DomainCompanionEvidence({
      checkedAt,
      dnsOwnerCheck: { domain: 'elsewhere.example', matched: false },
      expectedPubkey: 'aa'.repeat(32),
      httpsProbe: { ok: false, status: 404, url: 'https://example.com/.well-known/nostr.json?name=alice' },
      nip05Document: { names: { alice: 'bb'.repeat(32) } },
      subject,
    })

    expect(evidence.every(item => item.status === 'fail')).toBe(true)
  })

  it('turns exact list revision, sample review, and correction channel observations into passing evidence', () => {
    const author = listAuthor.pub
    const subject = canonicalAddressSubject(30000, author, 'trusted-relays')
    const listEvent = signEvent({
      content: '',
      created_at: checkedAt,
      kind: 30000,
      tags: [
        ['d', 'trusted-relays'],
        ['relay', 'wss://relay.example.com'],
      ],
    }, listAuthor.priv)
    const evidence = resolveListLabelerCompanionEvidence({
      checkedAt,
      correctionChannel: { reachable: true, url: 'https://example.com/corrections' },
      listEvent,
      sampleReview: { reviewedItems: 2, requiredItems: 1 },
      subject,
    })

    expect(evidence.map(item => [item.id, item.status])).toEqual([
      ['list-revision-fetch', 'pass'],
      ['sample-review', 'pass'],
      ['correction-channel', 'pass'],
    ])
  })

  it('feeds resolver output through deployment policy and rejects stale companion evidence', () => {
    const subject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const { assertion, circle } = circleAssertion(subject)
    const policy = createDeploymentPolicy(RELEASE_PACKAGE_MAINTAINER_REPUTATION_PROFILE, {
      acceptedCircleIds: [circle.circleId],
      companionEvidence: packageReleaseCompanionEvidenceRequirements(subject, { maxAgeSeconds: 300 }),
      expectedSubject: subject,
      expectedSubjectTagValue: externalProfileKind,
      metricPolicies: { rank: { required: true, min: 0, max: 100, integer: true } },
    })
    const freshEvidence = resolvePackageReleaseCompanionEvidence({
      checkedAt,
      packageVersion: {
        dist: { integrity: 'sha512-test' },
        name: 'nostr-veil',
        provenance: { verified: true },
        version: '0.14.0',
      },
      sbom: { format: 'spdx', packageName: 'nostr-veil', version: '0.14.0' },
      subject,
      vulnerabilityReport: { critical: 0, high: 0, subject },
    })
    const staleEvidence = freshEvidence.map(item => ({ ...item, checkedAt: checkedAt - 301 }))

    const accepted = verifyDeploymentPolicy(assertion, policy, { companionEvidence: freshEvidence, now: checkedAt })
    const rejected = verifyDeploymentPolicy(assertion, policy, { companionEvidence: staleEvidence, now: checkedAt })

    expect(accepted.valid, accepted.errors.join('; ')).toBe(true)
    expect(rejected.valid).toBe(false)
    expect(rejected.issues?.map(issue => issue.code)).toContain('companion.stale')
  })

  it('exports requirement helpers for supported companion-evidence profiles', () => {
    const packageSubject = canonicalNpmPackageSubject('nostr-veil', '0.14.0')
    const nip05Subject = canonicalNip05Subject('alice@example.com')
    const listSubject = canonicalAddressSubject(30000, listAuthor.pub, 'trusted-relays')

    expect(packageReleaseCompanionEvidenceRequirements(packageSubject).map(item => item.id)).toEqual([
      'npm-provenance',
      'sbom',
      'vulnerability-feed',
    ])
    expect(nip05DomainCompanionEvidenceRequirements(nip05Subject).map(item => item.id)).toEqual([
      'nip05-resolution',
      'https-probe',
      'dns-owner-check',
    ])
    expect(listLabelerCompanionEvidenceRequirements(listSubject).map(item => item.id)).toEqual([
      'list-revision-fetch',
      'sample-review',
      'correction-channel',
    ])

    const { assertion, circle } = listAssertion(listSubject)
    const policy = createDeploymentPolicy(LIST_LABELER_MODERATION_LIST_REPUTATION_PROFILE, {
      acceptedCircleIds: [circle.circleId],
      companionEvidence: listLabelerCompanionEvidenceRequirements(listSubject),
      expectedSubject: listSubject,
    })
    const missing = verifyDeploymentPolicy(assertion, policy, { now: checkedAt })

    expect(missing.valid).toBe(false)
    expect(missing.companionEvidence.missingIds).toEqual([
      'list-revision-fetch',
      'sample-review',
      'correction-channel',
    ])
    expect(NIP05_DOMAIN_SERVICE_PROVIDER_TRUST_PROFILE.id).toBe('nip05-domain-service-provider-trust')
  })
})
