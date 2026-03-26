import type {
  DuressEvent,
  DuressMonitor,
  DuressMonitorOptions,
  HeartbeatState,
} from './types.js'

interface MemberEntry {
  lastSeen: number
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Create a timer-based duress monitor.
 *
 * Tracks heartbeats per member pubkey. When a member fails to check in
 * within `toleranceMs`, a duress event is emitted. Pure state machine --
 * no relay interaction.
 */
export function createDuressMonitor(options: DuressMonitorOptions): DuressMonitor {
  const { toleranceMs } = options
  const members = new Map<string, MemberEntry>()
  const handlers: Array<(e: DuressEvent) => void> = []
  let running = false

  function emit(event: DuressEvent): void {
    for (const handler of handlers) handler(event)
  }

  function scheduleTimeout(pubkey: string, lastSeen: number): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const now = Date.now()
      const elapsed = now - lastSeen
      const level = elapsed >= toleranceMs * 2 ? 'critical' : 'warning'
      emit({
        type: 'heartbeat-missed',
        pubkey,
        lastSeen,
        elapsed,
        level,
      })
    }, toleranceMs)
  }

  return {
    heartbeat(pubkey: string): void {
      if (!running) return
      const now = Date.now()
      const existing = members.get(pubkey)
      if (existing) clearTimeout(existing.timeout)
      members.set(pubkey, {
        lastSeen: now,
        timeout: scheduleTimeout(pubkey, now),
      })
    },

    start(): void {
      running = true
    },

    stop(): void {
      running = false
      for (const entry of members.values()) {
        clearTimeout(entry.timeout)
      }
      members.clear()
    },

    on(_event: 'duress', handler: (e: DuressEvent) => void): void {
      handlers.push(handler)
    },

    getState(): Map<string, HeartbeatState> {
      const now = Date.now()
      const state = new Map<string, HeartbeatState>()
      for (const [pubkey, entry] of members) {
        const elapsed = now - entry.lastSeen
        let status: HeartbeatState['status'] = 'active'
        if (elapsed >= toleranceMs * 2) status = 'critical'
        else if (elapsed >= toleranceMs) status = 'warning'
        state.set(pubkey, { pubkey, lastSeen: entry.lastSeen, status })
      }
      return state
    },
  }
}
