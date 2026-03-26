import { writeFile, mkdir } from 'fs/promises'
import { execFileSync } from 'child_process'

const VOICE = process.env.TTS_VOICE || 'shimmer'
const MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts'
const SPEED = parseFloat(process.env.TTS_SPEED || '1.25')
const API_KEY = process.env.OPENAI_API_KEY || process.env.TTS_API_KEY
const INSTRUCTIONS = 'Warm, conversational British English. Natural filler words. Brisk but clear pace. You are showing a friend something exciting you built.'

let clipIndex = 0
const clips = []
let activePage = null

/** Set the Playwright page so narrate() can keep video time in sync */
export function setPage(page) {
  activePage = page
}

export async function narrate(text, outputDir = 'output/audio') {
  if (!API_KEY) {
    console.log(`[narrate] SKIP (no API key): ${text.slice(0, 50)}...`)
    const duration = text.split(/\s+/).length / 2.5
    clips.push({ index: clipIndex, text, duration, file: null, timestamp: Date.now() })
    clipIndex++
    if (activePage) await activePage.waitForTimeout(duration * 1000)
    return duration * 1000
  }

  // Record timestamp BEFORE generation starts (this is when the audio should play)
  const timestamp = Date.now()

  await mkdir(outputDir, { recursive: true })
  const file = `${outputDir}/clip-${String(clipIndex).padStart(3, '0')}.mp3`

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
      voice: VOICE,
      response_format: 'mp3',
      speed: SPEED,
      ...(MODEL === 'gpt-4o-mini-tts' ? { instructions: INSTRUCTIONS } : {}),
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`TTS failed: ${response.status} ${err}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(file, buffer)

  // Measure actual duration with ffprobe (safe: file path is developer-controlled)
  const duration = parseFloat(
    execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file])
      .toString()
      .trim()
  )

  clips.push({ index: clipIndex, text, duration, file, timestamp })
  clipIndex++

  console.log(`[narrate] clip-${String(clipIndex - 1).padStart(3, '0')}.mp3 (${duration.toFixed(1)}s): ${text.slice(0, 60)}...`)

  // Wait on the Playwright page so video time advances by the clip duration.
  // The TTS API call already took some wall-clock time, so subtract that.
  if (activePage) {
    const elapsed = Date.now() - timestamp
    const remaining = Math.max(0, duration * 1000 - elapsed)
    if (remaining > 0) {
      await activePage.waitForTimeout(remaining)
    }
  }

  return duration * 1000
}

export function getClips() { return clips }
export function resetClips() { clips.length = 0; clipIndex = 0 }
