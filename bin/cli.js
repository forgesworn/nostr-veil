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
import { AGGREGATES, isAggregateName } from '../dist/proof/aggregate.js'

const USAGE = `nostr-veil — anonymous trust assertions for Nostr

Usage:
  nostr-veil assert user <pubkey> [--json metrics]         Build kind 30382 user assertion
  nostr-veil assert event <event-id> [--json metrics]      Build kind 30383 event assertion
  nostr-veil assert address <address> [--json metrics]     Build kind 30384 addressable assertion
  nostr-veil assert identifier <id> <k-tag> [--json metrics]  Build kind 30385 identifier assertion
  nostr-veil provider-declare [--json entries]             Build kind 10040 provider declaration
  nostr-veil verify <event-json> [--kind n] [--aggregate fn]
                                                           Verify veil ring proof, print result
                                                           (--kind binds the expected NIP-85 kind; recommended
                                                            for v1 proofs, which are not kind-bound.
                                                            --aggregate requires that aggregate function: median,
                                                            mean, sum, min or max. The publisher chooses it and
                                                            the circle does not sign it, so without the flag the
                                                            same signatures also verify as a max or a min)
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

const VERIFY_OPTIONS = new Set(['--kind', '--aggregate'])

/**
 * Split verify's arguments into the event JSON and its options. Every argument
 * has to be accounted for: both options make the check stricter, so one that
 * was mistyped and dropped in silence would let the proof verify without the
 * check the caller asked for. An option is `--name value` or `--name=value`,
 * before or after the event.
 */
function parseVerifyArgs(args) {
  const options = new Map()
  const positionals = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    // An event is a JSON object, so nothing that starts with a dash is one
    if (!arg.startsWith('-')) {
      positionals.push(arg)
      continue
    }
    const equals = arg.indexOf('=')
    const name = equals === -1 ? arg : arg.slice(0, equals)
    if (!VERIFY_OPTIONS.has(name)) {
      console.error(`Error: unknown option ${name}. Run nostr-veil --help for usage.`)
      process.exit(1)
    }
    if (options.has(name)) {
      console.error(`Error: ${name} given more than once`)
      process.exit(1)
    }
    // The value is undefined when the option came last with no value
    options.set(name, equals === -1 ? args[++i] : arg.slice(equals + 1))
  }

  if (positionals.length > 1) {
    console.error(`Error: verify takes one <event-json>, not ${positionals.length}`)
    process.exit(1)
  }

  let expectedKind
  if (options.has('--kind')) {
    const value = options.get('--kind')
    if (value === undefined) {
      console.error('Error: --kind requires a value')
      process.exit(1)
    }
    // Decimal digits only: Number() also reads '', ' ', '0x10' and '3e4' as integers
    if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
      console.error('Error: --kind must be a non-negative integer')
      process.exit(1)
    }
    expectedKind = Number(value)
  }

  let requireAggregate
  if (options.has('--aggregate')) {
    const name = options.get('--aggregate')
    if (name === undefined || !isAggregateName(name)) {
      const names = Object.keys(AGGREGATES)
      console.error(`Error: --aggregate must be one of ${names.slice(0, -1).join(', ')} or ${names.at(-1)}`)
      process.exit(1)
    }
    requireAggregate = name
  }

  return { eventJson: positionals[0], expectedKind, requireAggregate }
}

function cmdVerify(args) {
  const { eventJson, expectedKind, requireAggregate } = parseVerifyArgs(args)
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
  const options = {
    ...(expectedKind === undefined ? {} : { expectedKind }),
    ...(requireAggregate === undefined ? {} : { requireAggregate }),
  }
  // With neither flag the call is the same bare verifyProof(event) as before
  const result = verifyProof(event, Object.keys(options).length === 0 ? undefined : options)
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
