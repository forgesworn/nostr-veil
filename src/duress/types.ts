export type AlertLevel = 'warning' | 'critical'

export interface HeartbeatState {
  pubkey: string
  lastSeen: number
  status: 'active' | 'warning' | 'critical'
}

export interface DuressEvent {
  type: 'heartbeat-missed'
  pubkey: string
  lastSeen: number
  elapsed: number
  level: AlertLevel
}

export interface DuressMonitor {
  heartbeat(pubkey: string): void
  start(): void
  stop(): void
  on(event: 'duress', handler: (e: DuressEvent) => void): void
  getState(): Map<string, HeartbeatState>
}

export interface DuressMonitorOptions {
  toleranceMs: number
  checkIntervalMs: number
}
