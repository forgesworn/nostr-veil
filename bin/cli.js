#!/usr/bin/env node

import { loadConfig } from './config.js'
import { signEvent } from '../dist/signing.js'
import {
  buildUserAssertion,
  buildEventAssertion,
  buildAddressableAssertion,
  buildIdentifierAssertion,
  buildProviderDeclaration,
} from '../dist/nip85/builders.js'
import { verifyProof } from '../dist/proof/verify.js'

const USAGE = `nostr-veil — anonymous trust assertions for Nostr

Usage:
  nostr-veil assert user <pubkey> [--json metrics]         Build kind 30382 user assertion
  nostr-veil assert event <event-id> [--json metrics]      Build kind 30383 event assertion
  nostr-veil assert address <address> [--json metrics]     Build kind 30384 addressable assertion
  nostr-veil assert identifier <id> <k-tag> [--json metrics]  Build kind 30385 identifier assertion
  nostr-veil provider-declare [--json entries]             Build kind 10040 provider declaration
  nostr-veil verify <event-json>                           Verify veil ring proof, print result
  nostr-veil --help                                        Show this message

Environment:
  NOSTR_SECRET_KEY       64-char hex private key
  NOSTR_SECRET_KEY_FILE  Path to secret key file (takes precedence)

Output is signed event JSON to stdout. Pipe to other tools for relay publishing.
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract --json value from args (the next arg after --json). */
function extractJsonFlag(args) {
  const idx = args.indexOf('--json')
  if (idx === -1 || idx + 1 >= args.length) return undefined
  try {
    return JSON.parse(args[idx + 1])
  } catch {
    console.error('Error: invalid JSON after --json flag')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdAssert(args) {
  const subcommand = args[0]
  if (!subcommand) {
    console.error('Error: assert requires a subcommand (user, event, address, identifier)')
    process.exit(1)
  }

  const { secretKey } = loadConfig()
  const metrics = extractJsonFlag(args) ?? {}
  let template

  switch (subcommand) {
    case 'user': {
      const pubkey = args[1]
      if (!pubkey) { console.error('Error: assert user requires <pubkey>'); process.exit(1) }
      template = buildUserAssertion(pubkey, metrics)
      break
    }
    case 'event': {
      const eventId = args[1]
      if (!eventId) { console.error('Error: assert event requires <event-id>'); process.exit(1) }
      template = buildEventAssertion(eventId, metrics)
      break
    }
    case 'address': {
      const address = args[1]
      if (!address) { console.error('Error: assert address requires <address>'); process.exit(1) }
      template = buildAddressableAssertion(address, metrics)
      break
    }
    case 'identifier': {
      const id = args[1]
      const kTag = args[2]
      if (!id || !kTag) { console.error('Error: assert identifier requires <id> <k-tag>'); process.exit(1) }
      template = buildIdentifierAssertion(id, kTag, metrics)
      break
    }
    default:
      console.error(`Error: unknown assert subcommand '${subcommand}'`)
      process.exit(1)
  }

  const signed = signEvent(template, secretKey)
  console.log(JSON.stringify(signed, null, 2))
}

function cmdProviderDeclare(args) {
  const { secretKey } = loadConfig()
  const entries = extractJsonFlag(args) ?? []
  const template = buildProviderDeclaration(entries)
  const signed = signEvent(template, secretKey)
  console.log(JSON.stringify(signed, null, 2))
}

function cmdVerify(args) {
  const eventJson = args[0]
  if (!eventJson) {
    console.error('Error: verify requires <event-json>')
    process.exit(1)
  }

  let event
  try {
    event = JSON.parse(eventJson)
  } catch {
    console.error('Error: invalid JSON in event argument')
    process.exit(1)
  }
  if (!event || typeof event !== 'object' || !Array.isArray(event.tags)) {
    console.error('Error: event must be a JSON object with a "tags" array')
    process.exit(1)
  }
  const result = verifyProof(event)
  console.log(JSON.stringify(result, null, 2))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === '--help' || command === '-h') {
  console.log(USAGE)
  process.exit(0)
}

switch (command) {
  case 'assert':
    cmdAssert(args.slice(1))
    break
  case 'provider-declare':
    cmdProviderDeclare(args.slice(1))
    break
  case 'verify':
    cmdVerify(args.slice(1))
    break
  default:
    console.error(`Error: unknown command '${command}'. Run nostr-veil --help for usage.`)
    process.exit(1)
}
