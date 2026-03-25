import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import { mkdir } from 'fs/promises'
import { narrate, getClips, resetClips } from './narrate.js'
import { compose } from './compose.js'
import { injectCursor, showCursor, hideCursor, clickElement, moveTo, pause } from './cursor.js'

const DEMO_DIR = '../../demo'
const OUTPUT_DIR = 'output'
const WIDTH = 1920
const HEIGHT = 1080

async function startDevServer() {
  console.log('[record] Starting demo dev server...')
  const server = spawn('npm', ['run', 'dev', '--', '--port', '3847'], {
    cwd: DEMO_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  })

  return new Promise((resolve) => {
    server.stdout.on('data', (data) => {
      const str = data.toString()
      if (str.includes('Local:') || str.includes('localhost')) {
        console.log('[record] Dev server ready')
        resolve(server)
      }
    })
    server.stderr.on('data', (data) => {
      // Vite logs to stderr
      const str = data.toString()
      if (str.includes('Local:') || str.includes('localhost')) {
        console.log('[record] Dev server ready')
        resolve(server)
      }
    })
    setTimeout(() => resolve(server), 5000) // fallback timeout
  })
}

async function waitForIdle(page, ms = 500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

async function runDemo(page) {
  const startTimestamp = Date.now()

  await page.goto('http://localhost:3847', { waitUntil: 'networkidle' })
  await waitForIdle(page, 1000)
  await injectCursor(page)

  // ===================================================
  // HOOK -- 15s
  // ===================================================
  await narrate("What if trust scores could be verified — without revealing who contributed them?")
  await pause(page, 1500)

  await narrate("This is Veil. Privacy-preserving Web of Trust for Nostr.")
  await pause(page, 1000)

  // ===================================================
  // PROBLEM -- 20s
  // ===================================================
  await narrate("Right now, NIP-eighty-five trust assertions are trust-me scores. A provider publishes a rank, and everyone can see exactly who made that judgement.")
  await pause(page, 500)

  await narrate("That's fine for follower counts. But it fails the moment the context is sensitive. Abuse reporting. Whistleblowing. Political dissent. The people who need Web of Trust most are the ones who can't afford to be identified.")
  await pause(page, 1500)

  // ===================================================
  // SCREEN 1: THE CIRCLE -- 45s
  // ===================================================
  await narrate("So let me show you how Veil solves this. We start with a trust circle — eight journalists who want to vouch for a source's credibility.")
  await pause(page, 1000)

  await showCursor(page)

  // Click on a journalist to select them
  await Promise.all([
    narrate("Each journalist is a real Nostr pubkey. I'll pick Elena Novak — she's going to be our point of view for this demo."),
    (async () => {
      await pause(page, 500)
      // Click on the first journalist in the circle
      try { await clickElement(page, '[data-journalist="0"]', { moveDuration: 600 }) } catch {
        // Fallback — click first clickable element in the circle area
        try { await clickElement(page, 'circle, [role="button"], button:not(:last-child)', { moveDuration: 600 }) } catch {}
      }
    })(),
  ])

  await pause(page, 500)

  await Promise.all([
    narrate("Notice the circle ID at the bottom — that's a SHA-256 hash of all eight sorted pubkeys. It uniquely identifies this group."),
    pause(page, 2000),
  ])

  // Click Next to advance to Screen 2
  await Promise.all([
    narrate("Let's join the circle and see what happens next."),
    (async () => {
      await pause(page, 500)
      await clickElement(page, 'button:last-of-type', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1000)

  // ===================================================
  // SCREEN 2: THE SOURCE -- 45s
  // ===================================================
  await narrate("A source appears — someone claiming to have leaked documents from a major corporation. Each journalist needs to independently score their credibility.")
  await pause(page, 1500)

  await Promise.all([
    narrate("I'll set Elena's score to eighty-two. The other seven journalists have already submitted their own scores independently."),
    (async () => {
      await pause(page, 500)
      // Try to interact with the slider
      try { await clickElement(page, 'input[type="range"]', { moveDuration: 500 }) } catch {}
    })(),
  ])

  await pause(page, 500)

  await narrate("Watch the attestation feed on the right — each score is a kind thirty-one-thousand verifiable attestation. Real Nostr events, real cryptography.")
  await pause(page, 2000)

  await Promise.all([
    narrate("Now here's where it gets interesting. Let's submit these scores and see the veil come down."),
    (async () => {
      await pause(page, 500)
      await clickElement(page, 'button:last-of-type', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1500)

  // ===================================================
  // SCREEN 3: THE VEIL -- 60s
  // ===================================================
  await narrate("This is the heart of Veil. All eight contributions have been aggregated into a single NIP-eighty-five assertion. The median rank is eighty-two.")
  await pause(page, 1500)

  await narrate("But look at what happened. Each journalist signed their contribution with an LSAG ring signature — a Linkable Spontaneous Anonymous Group signature. The signature proves they're a member of the circle, without revealing which member they are.")
  await pause(page, 2000)

  await Promise.all([
    narrate("Look at the raw event on the right. It's a standard kind thirty-thousand-three-hundred-eighty-two NIP-eighty-five event. Any existing client can read the rank. But see the extra tags?"),
    pause(page, 2000),
  ])

  await narrate("Veil-ring contains all eight pubkeys — the ring. Veil-threshold says five of eight agreed. And each veil-sig tag carries a serialised LSAG signature with a key image.")
  await pause(page, 2000)

  await narrate("The key images are the clever bit. They're deterministic per signer and context — so if someone tries to vote twice, the duplicate key image gives them away. But they don't reveal which pubkey produced them.")
  await pause(page, 1500)

  await Promise.all([
    narrate("Let's verify this proof."),
    (async () => {
      await pause(page, 500)
      await clickElement(page, 'button:last-of-type', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1000)

  // ===================================================
  // SCREEN 4: VERIFICATION -- 40s
  // ===================================================
  await narrate("Verification happens in four steps. First, extract the ring from the veil-ring tag. Then check each LSAG signature against the ring.")
  await pause(page, 1500)

  await narrate("Third, verify all key images are unique — no double voting. And finally, confirm the number of valid distinct signatures meets the threshold.")
  await pause(page, 1500)

  await narrate("And there it is — valid. Five distinct signers out of eight circle members. All confirmed. No private keys needed. The ring is public. The identities of the actual signers are not.")
  await pause(page, 2000)

  await Promise.all([
    narrate("But what if a journalist later wants to reveal themselves? That's what the identity layer is for."),
    (async () => {
      await pause(page, 1000)
      await clickElement(page, 'button:last-of-type', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1000)

  // ===================================================
  // SCREEN 5: THE REVEAL -- 45s
  // ===================================================
  await narrate("Elena has two identities — her public journalist persona and the anonymous persona she used in the trust circle. Both are derived from the same master key using nsec-tree.")
  await pause(page, 1500)

  await narrate("They look like completely different Nostr identities. No one can tell they're related — until Elena decides to prove it.")
  await pause(page, 1500)

  await Promise.all([
    narrate("Watch. She generates a blind linkage proof. This proves both identities share the same root — without revealing the derivation path or the master key."),
    (async () => {
      await pause(page, 500)
      try { await clickElement(page, 'button:not(:last-of-type)', { moveDuration: 500 }) } catch {
        try { await clickElement(page, 'button', { moveDuration: 500 }) } catch {}
      }
    })(),
  ])

  await pause(page, 2000)

  await narrate("The proof is verifiable by anyone. Voluntary. And if she chose full disclosure mode instead of blind, it would also reveal which derivation path she used.")
  await pause(page, 1500)

  await hideCursor(page)

  // ===================================================
  // CLOSE -- 30s
  // ===================================================
  await narrate("That's Veil. Trust scores you can verify, from contributors you can't identify. Standard NIP-eighty-five events that any client can consume. Cryptographic proofs that Veil-aware clients can verify.")
  await pause(page, 1500)

  await narrate("The crypto primitives powering this — ring-sig, nostr-attestations, nsec-tree — are published npm packages you can use today. One hundred tests. MIT licence. Ready for production.")
  await pause(page, 1500)

  await narrate("nostr-veil. Privacy-preserving Web of Trust for Nostr.")
  await pause(page, 3000)

  return startTimestamp
}

// Main
async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })
  resetClips()

  const server = await startDevServer()

  try {
    const browser = await chromium.launch({
      headless: false,
      args: ['--enable-webgl', '--ignore-gpu-blocklist'],
    })

    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      recordVideo: {
        dir: `${OUTPUT_DIR}/raw`,
        size: { width: WIDTH, height: HEIGHT },
      },
    })

    const page = await context.newPage()
    const startTimestamp = await runDemo(page)

    await page.close()
    const video = await context.pages()[0]?.video()?.path() || (await context.close(), null)
    await context.close()
    await browser.close()

    // Find the recorded video
    const { readdirSync } = await import('fs')
    const rawFiles = readdirSync(`${OUTPUT_DIR}/raw`).filter(f => f.endsWith('.webm'))
    const videoPath = `${OUTPUT_DIR}/raw/${rawFiles[rawFiles.length - 1]}`

    // Compose final video
    compose(videoPath, `${OUTPUT_DIR}/nostr-veil-demo.mp4`, startTimestamp)

    console.log('\n✓ Demo recording complete: output/nostr-veil-demo.mp4')
  } finally {
    server.kill()
  }
}

main().catch(console.error)
