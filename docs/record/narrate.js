import { writeFile, mkdir } from 'fs/promises'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const VOICE = process.env.TTS_VOICE || 'shimmer'
const MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts'
const SPEED = parseFloat(process.env.TTS_SPEED || '1.25')
const API_KEY = process.env.OPENAI_API_KEY || process.env.TTS_API_KEY
const INSTRUCTIONS = 'Warm, conversational British English. Natural filler words. Brisk but clear pace. You are showing a friend something exciting you built.'

let clipIndex = 0
const clips = []

export async function narrate(text, outputDir = 'output/audio') {
  if (!API_KEY) {
    console.log(`[narrate] SKIP (no API key): ${text.slice(0, 50)}...`)
    const duration = text.split(/\s+/).length / 2.5 // rough estimate at 1.25x speed
    clips.push({ index: clipIndex, text, duration, file: null, timestamp: Date.now() })
    clipIndex++
    return duration * 1000
  }

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

  // Measure actual duration with ffprobe
  // Note: execSync is safe here — file path is developer-controlled, not user input
  const duration = parseFloat(
    execSync(`ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`)
      .toString()
      .trim()
  )

  // Record timestamp AFTER generation (not before)
  const timestamp = Date.now()
  clips.push({ index: clipIndex, text, duration, file, timestamp })
  clipIndex++

  console.log(`[narrate] clip-${String(clipIndex - 1).padStart(3, '0')}.mp3 (${duration.toFixed(1)}s): ${text.slice(0, 60)}...`)
  return duration * 1000 // return ms for await timing
}

export function getClips() { return clips }
export function resetClips() { clips.length = 0; clipIndex = 0 }
