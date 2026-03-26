import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import { mkdir } from 'fs/promises'
import { narrate, getClips, resetClips, setPage } from './narrate.js'
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
      const str = data.toString()
      if (str.includes('Local:') || str.includes('localhost')) {
        console.log('[record] Dev server ready')
        resolve(server)
      }
    })
    setTimeout(() => resolve(server), 5000)
  })
}

async function waitForIdle(page, ms = 500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

/** Click a button by its visible text */
async function clickButton(page, text, opts = {}) {
  await clickElement(page, `button:has-text("${text}")`, opts)
}

/** Click inside the SVG circle ring to select a journalist (0-indexed) */
async function clickJournalist(page, index) {
  // The SVG is 400x400 with 8 nodes in a ring of radius 155, centred at (200,200)
  const angle = (index / 8) * Math.PI * 2 - Math.PI / 2
  const svgX = 200 + 155 * Math.cos(angle)
  const svgY = 200 + 155 * Math.sin(angle)

  // Get the SVG element's position on screen
  const svgBox = await page.locator('svg').first().boundingBox()
  if (!svgBox) return

  const screenX = svgBox.x + svgX
  const screenY = svgBox.y + svgY

  await moveTo(page, screenX, screenY, 600)
  await page.mouse.click(screenX, screenY)
  await page.waitForTimeout(200)
}

async function runDemo(page) {
  const startTimestamp = Date.now()

  await page.goto('http://localhost:3847', { waitUntil: 'networkidle' })
  await waitForIdle(page, 1500)
  await injectCursor(page)

  // ===================================================
  // HOOK — 15s
  // ===================================================
  await narrate('What if trust scores could be verified, without revealing who contributed them?')
  await pause(page, 1500)

  await narrate('This is Veil. Anonymous group trust for Nostr.')
  await pause(page, 1000)

  // ===================================================
  // PROBLEM — 15s
  // ===================================================
  await narrate('Right now, NIP-eighty-five trust assertions are public. A provider publishes a rank, and everyone can see who made that judgement.')
  await pause(page, 500)

  await narrate('That works for follower counts. But it fails when the context is sensitive. Whistleblowing. Abuse reporting. Political dissent.')
  await pause(page, 1500)

  // ===================================================
  // SCREEN 1: THE CIRCLE — 40s
  // ===================================================
  await narrate('So let me show you how Veil solves this. We start with a trust circle. Eight journalists who want to vouch for a source.')
  await pause(page, 1000)

  await showCursor(page)

  await Promise.all([
    narrate("I'll pick Elena Novak. She's going to be our point of view."),
    (async () => {
      await pause(page, 500)
      await clickJournalist(page, 0)
    })(),
  ])

  await pause(page, 800)

  await narrate('Notice the circle ID below. That is a SHA-256 hash of all eight sorted pubkeys. It uniquely identifies this group.')
  await pause(page, 1500)

  await Promise.all([
    narrate("Let's join the circle."),
    (async () => {
      await pause(page, 500)
      await clickButton(page, 'JOIN THE CIRCLE', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1000)

  // ===================================================
  // SCREEN 2: THE SOURCE — 35s
  // ===================================================
  await narrate('A source appears. Someone claiming leaked documents from a major corporation. Each journalist scores their credibility independently.')
  await pause(page, 1500)

  await Promise.all([
    narrate("I'll set Elena's score to around eighty. The other seven are scoring in parallel."),
    (async () => {
      await pause(page, 500)
      // Click the range slider near the 80% mark
      const slider = page.locator('input[type="range"]')
      const sliderBox = await slider.boundingBox()
      if (sliderBox) {
        const targetX = sliderBox.x + sliderBox.width * 0.8
        const targetY = sliderBox.y + sliderBox.height / 2
        await moveTo(page, targetX, targetY, 500)
        await page.mouse.click(targetX, targetY)
      }
    })(),
  ])

  await pause(page, 2000) // wait for NPC scores to drip in

  await narrate('Watch the attestation feed on the right. Each score becomes a real Nostr event.')
  await pause(page, 1500)

  await Promise.all([
    narrate('Now here is where it gets interesting. Let us submit these scores.'),
    (async () => {
      await pause(page, 500)
      await clickButton(page, 'SUBMIT SCORES', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1500)

  // ===================================================
  // SCREEN 3: THE VEIL — 50s
  // ===================================================
  await narrate('This is the heart of Veil. All eight contributions have been aggregated into a single NIP-eighty-five event.')
  await pause(page, 1500)

  await narrate('Each journalist signed their contribution with an LSAG ring signature. Linkable Spontaneous Anonymous Group. The signature proves they are a member of the circle, without revealing which member.')
  await pause(page, 2000)

  await narrate('Look at the raw event on the right. Standard kind thirty-thousand-three-hundred-eighty-two. Any existing client can read the rank. But see the extra tags?')
  await pause(page, 2000)

  await narrate('Veil-ring contains all eight pubkeys. Each veil-sig tag carries an LSAG signature with a key image. The key images prevent double-voting without revealing who voted.')
  await pause(page, 2000)

  await Promise.all([
    narrate("Let's verify this proof."),
    (async () => {
      await pause(page, 500)
      await clickButton(page, 'VERIFY', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1000)

  // ===================================================
  // SCREEN 4: VERIFICATION — 35s
  // ===================================================
  await narrate('Verification happens in five steps. Extract the ring. Parse each LSAG signature. Verify against the ring. Check key images for duplicates. Validate the threshold.')
  await pause(page, 2000)

  // Wait for the animated verification to complete
  await page.waitForTimeout(3500)

  await narrate('Valid. Eight distinct signers out of eight circle members. All confirmed. No private keys needed. The ring is public. The identities of the actual signers are not.')
  await pause(page, 2000)

  await Promise.all([
    narrate('But what if a journalist later wants to reveal themselves?'),
    (async () => {
      await pause(page, 1000)
      await clickButton(page, 'CONTINUE', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 1000)

  // ===================================================
  // SCREEN 5: THE REVEAL — 40s
  // ===================================================
  await narrate('Elena has two identities. Her public persona and the anonymous one she used in the circle. Both derived from the same master key using nsec-tree.')
  await pause(page, 1500)

  await narrate('They look like completely different Nostr identities. No one can tell they are related, until Elena decides to prove it.')
  await pause(page, 1500)

  await Promise.all([
    narrate('Watch. She generates a blind linkage proof. This proves both identities share the same root, without revealing how.'),
    (async () => {
      await pause(page, 500)
      await clickButton(page, 'REVEAL IDENTITY', { moveDuration: 500 })
    })(),
  ])

  await pause(page, 2000)

  await narrate('The proof is verifiable by anyone. Voluntary. Only Elena is exposed. The other seven stay anonymous.')
  await pause(page, 1500)

  await Promise.all([
    narrate('Now let us see the full picture.'),
    (async () => {
      await pause(page, 500)
      await clickButton(page, 'VIEW NETWORK', { moveDuration: 400 })
    })(),
  ])

  await waitForIdle(page, 2000)

  // ===================================================
  // SCREEN 6: THE NETWORK — 50s
  // ===================================================
  await narrate('This is the trust graph. The same eight journalists, the source, and every endorsement visualised as a network. Amber nodes have anonymous ring-endorsed scores.')
  await pause(page, 2000)

  // Click a node to show the panel
  await Promise.all([
    narrate('Click any node to inspect its NIP-eighty-five metrics. Standard endorsement count, ring endorsements, the actual trust data.'),
    (async () => {
      await pause(page, 800)
      // Click roughly in the centre of the graph where nodes cluster
      const svgEl = page.locator('svg').first()
      const svgBox = await svgEl.boundingBox()
      if (svgBox) {
        await moveTo(page, svgBox.x + svgBox.width * 0.45, svgBox.y + svgBox.height * 0.45, 600)
        await page.mouse.click(svgBox.x + svgBox.width * 0.45, svgBox.y + svgBox.height * 0.45)
      }
    })(),
  ])

  await pause(page, 2500)

  // Ring endorse animation
  await Promise.all([
    narrate('Watch what happens when the circle endorses someone. The golden arc sweeps through the ring members. One NIP-eighty-five event, anonymous, verifiable.'),
    (async () => {
      await pause(page, 500)
      await clickButton(page, 'RING ENDORSE', { moveDuration: 400 })
    })(),
  ])

  await pause(page, 4000) // let the arc animation play

  // Duress animation
  await Promise.all([
    narrate('And if a member is compromised? Canary-kit detects the missing heartbeat and isolates the node. Coerced trust scores cannot corrupt the graph. Ring signatures alone are not enough. You need liveness too.'),
    (async () => {
      await pause(page, 1000)
      await clickButton(page, 'DURESS', { moveDuration: 400 })
    })(),
  ])

  await pause(page, 4000) // let the duress animation play

  await hideCursor(page)

  // ===================================================
  // CLOSE — 20s
  // ===================================================
  await narrate('That is Veil. Trust scores you can verify, from contributors you cannot identify. Standard NIP-eighty-five events that any client can consume. Cryptographic proofs that Veil-aware clients can verify.')
  await pause(page, 1500)

  await narrate('The crypto primitives powering this, ring-sig, nostr-attestations, nsec-tree, are published npm packages you can use today. One hundred and seventy-eight tests. MIT licence.')
  await pause(page, 1500)

  await narrate('nostr-veil. Anonymous group trust for Nostr.')
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
    setPage(page)
    const startTimestamp = await runDemo(page)

    await page.close()
    await context.close()
    await browser.close()

    // Find the recorded video
    const { readdirSync } = await import('fs')
    const rawFiles = readdirSync(`${OUTPUT_DIR}/raw`).filter(f => f.endsWith('.webm'))
    const videoPath = `${OUTPUT_DIR}/raw/${rawFiles[rawFiles.length - 1]}`

    // Compose final video
    compose(videoPath, `${OUTPUT_DIR}/nostr-veil-demo.mp4`, startTimestamp)

    console.log('\n\u2713 Demo recording complete: output/nostr-veil-demo.mp4')
  } finally {
    server.kill()
  }
}

main().catch(console.error)
