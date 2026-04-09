const RELAY = 'wss://relay.trotters.cc'

/** Fire-and-forget publish to the demo relay. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publishToRelay(event: any): void {
  try {
    const ws = new WebSocket(RELAY)
    const timeout = setTimeout(() => ws.close(), 8000)
    ws.onopen = () => ws.send(JSON.stringify(['EVENT', event]))
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(String(msg.data))
        if (data[0] === 'OK') { clearTimeout(timeout); ws.close() }
      } catch { /* ignore */ }
    }
    ws.onerror = () => { clearTimeout(timeout); ws.close() }
  } catch { /* ignore */ }
}
