import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('in-room flags example', () => {
  it('counts distinct flaggers inside a private room without publishing the roster', { timeout: 30_000 }, () => {
    const output = execFileSync('npm', ['run', 'test:in-room-flags'], {
      cwd: root,
      encoding: 'utf8',
    })

    // Two members have flagged: below the threshold
    expect(output).toContain('in-room-flags: after-two distinct=2 surfaced=no')
    // Thirteen envelopes: a repeat flag counts once, and a ring that is not the
    // room's, a flag that leaves out the metric, two sound flags under no
    // scope or another scope, and five that are not flags at all are rejected
    // one by one, without zeroing the count or stopping it
    expect(output).toContain('envelopes=13 valid=4 rejected=9 distinct=3 threshold=3 surfaced=yes')
    // Nothing on the wire names a member
    expect(output).toContain('roster-on-wire=no outer-keys=13 outer-keys-in-roster=0')
  })
})
