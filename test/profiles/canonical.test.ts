import { describe, expect, it } from 'vitest'
import {
  canonicalAddressSubject,
  canonicalDomainSubject,
  canonicalEventSubject,
  canonicalGitRepositorySubject,
  canonicalGithubRepositorySubject,
  canonicalLnurlpSubject,
  canonicalMaintainerSubject,
  canonicalNip96Subject,
  canonicalNip05Subject,
  canonicalNpmPackageSubject,
  canonicalPubkeySubject,
  canonicalRelaySubject,
  canonicalServiceSubject,
  canonicalSourceSubject,
  canonicalVendorSubject,
  subjectMatchesFormat,
} from '../../src/profiles/index.js'

const hex = 'a'.repeat(64)

describe('profile subject canonicalisation', () => {
  it('canonicalises Nostr-native subjects', () => {
    expect(canonicalPubkeySubject(hex.toUpperCase())).toBe(hex)
    expect(canonicalEventSubject(hex.toUpperCase())).toBe(hex)
    expect(canonicalAddressSubject(30023, hex.toUpperCase(), 'paper-1')).toBe(`30023:${hex}:paper-1`)
  })

  it('canonicalises external identifier subjects', () => {
    expect(canonicalRelaySubject('relay:WSS://Relay.Example.com/')).toBe('relay:wss://relay.example.com')
    expect(canonicalNip05Subject('Alice@Example.COM')).toBe('nip05:Alice@example.com')
    expect(canonicalDomainSubject('https://Example.COM/path')).toBe('domain:example.com')
    expect(canonicalNpmPackageSubject('@ForgeSworn/Nostr-Veil', '0.14.0')).toBe('npm:@forgesworn/nostr-veil@0.14.0')
    expect(canonicalGithubRepositorySubject('ForgeSworn', 'Nostr-Veil', '36f74b0')).toBe('git:https://github.com/forgesworn/nostr-veil@36f74b0')
    expect(canonicalGitRepositorySubject('https://Git.Example.com/Team/Repo.git/', 'v1.0.0')).toBe('git:https://git.example.com/Team/Repo@v1.0.0')
    expect(canonicalMaintainerSubject('GitHub', 'ForgeSworn')).toBe('maintainer:github:forgesworn')
    expect(canonicalServiceSubject('Blossom', 'Example.COM/')).toBe('service:blossom:example.com')
    expect(canonicalServiceSubject('Moderation', 'HTTPS://Mod.Example.com/api/')).toBe('service:moderation:https://mod.example.com/api')
    expect(canonicalLnurlpSubject('Alice@Example.COM')).toBe('lnurlp:Alice@example.com')
    expect(canonicalNip96Subject('HTTPS://Upload.Example.com/')).toBe('nip96:https://upload.example.com')
    expect(canonicalVendorSubject('Market.Example', 'alice')).toBe('vendor:market.example:alice')
    expect(canonicalSourceSubject('Newsroom_A', 'case-2026-05')).toBe('source:newsroom_a:case-2026-05')
  })

  it('validates profile subject formats', () => {
    expect(subjectMatchesFormat(hex, 'pubkey')).toBe(true)
    expect(subjectMatchesFormat(`30023:${hex}:paper`, 'address')).toBe(true)
    expect(subjectMatchesFormat('relay:wss://relay.example.com', 'relay')).toBe(true)
    expect(subjectMatchesFormat('nip05:alice@example.com', 'nip05')).toBe(true)
    expect(subjectMatchesFormat('domain:example.com', 'domain')).toBe(true)
    expect(subjectMatchesFormat('npm:nostr-veil@0.14.0', 'package')).toBe(true)
    expect(subjectMatchesFormat('git:https://github.com/forgesworn/nostr-veil@36f74b0', 'git')).toBe(true)
    expect(subjectMatchesFormat('maintainer:github:forgesworn', 'maintainer')).toBe(true)
    expect(subjectMatchesFormat('service:blossom:example.com', 'service')).toBe(true)
    expect(subjectMatchesFormat('service:moderation:https://mod.example.com/api', 'service')).toBe(true)
    expect(subjectMatchesFormat('lnurlp:alice@example.com', 'lnurlp')).toBe(true)
    expect(subjectMatchesFormat('nip96:https://upload.example.com', 'nip96')).toBe(true)
    expect(subjectMatchesFormat('vendor:market.example:alice', 'vendor')).toBe(true)
    expect(subjectMatchesFormat('source:newsroom-a:case-1', 'source')).toBe(true)
  })

  it('rejects ambiguous or malformed subjects', () => {
    expect(() => canonicalPubkeySubject('npub1...')).toThrow()
    expect(() => canonicalRelaySubject('https://relay.example.com')).toThrow()
    expect(() => canonicalNip05Subject('alice@@example.com')).toThrow()
    expect(() => canonicalNpmPackageSubject('nostr-veil', '')).toThrow()
    expect(() => canonicalGitRepositorySubject('git@github.com:forgesworn/nostr-veil')).toThrow()
    expect(() => canonicalMaintainerSubject('bad service', 'alice')).toThrow()
    expect(() => canonicalServiceSubject('blossom', 'not a host')).toThrow()
    expect(() => canonicalLnurlpSubject('alice@@example.com')).toThrow()
    expect(() => canonicalNip96Subject('wss://upload.example.com')).toThrow()
    expect(() => canonicalVendorSubject('market.example', 'bad id')).toThrow()
    expect(() => canonicalSourceSubject('newsroom-a', 'bad id')).toThrow()
    expect(subjectMatchesFormat('relay:https://relay.example.com', 'relay')).toBe(false)
    expect(subjectMatchesFormat('relay:wss://relay.example.com/', 'relay')).toBe(false)
    expect(subjectMatchesFormat('domain:example..com', 'domain')).toBe(false)
    expect(subjectMatchesFormat('npm:Nostr-Veil@0.14.0', 'package')).toBe(false)
    expect(subjectMatchesFormat('git:ssh://git.example.com/repo', 'git')).toBe(false)
    expect(subjectMatchesFormat('maintainer:github:bad id', 'maintainer')).toBe(false)
    expect(subjectMatchesFormat('service:blossom:not a host', 'service')).toBe(false)
  })
})
