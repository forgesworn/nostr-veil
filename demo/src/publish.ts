import { SimplePool, type Event as NostrEvent, type Filter } from 'nostr-tools'

export const DEMO_RELAY = 'wss://relay.trotters.cc'

/**
 * Persistent pool -- nostr-tools SimplePool sends WebSocket pings every 29s,
 * keeping connections alive during demo pauses (talking, Q&A, etc).
 */
const pool = new SimplePool()

/** Fire-and-forget publish to the demo relay. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publishToRelay(event: any): void {
  try {
    const promises = pool.publish([DEMO_RELAY], event)
    for (const p of promises) p.catch(err => console.warn('[publish] relay rejected:', err))
  } catch (err) {
    console.warn('[publish] pool error:', err)
  }
}

/** Awaitable publish to specific relays. Returns count of relays that accepted. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function publishToRelays(relays: string[], event: any): Promise<number> {
  const promises = pool.publish(relays, event)
  const results = await Promise.allSettled(promises)
  return results.filter(r => r.status === 'fulfilled').length
}

/** One-shot query against the demo relay. */
export async function queryRelay(filter: Filter): Promise<NostrEvent[]> {
  return pool.querySync([DEMO_RELAY], filter)
}
