import { execSync } from 'child_process'
import { getClips } from './narrate.js'

export function compose(videoPath, outputPath, startTimestamp) {
  const clips = getClips().filter(c => c.file !== null)

  if (clips.length === 0) {
    console.log('[compose] No audio clips — copying video as-is')
    execSync(`cp "${videoPath}" "${outputPath}"`)
    return
  }

  // Build ffmpeg filter for delayed audio mixing
  // Note: execSync is safe here — all paths are developer-controlled, not user input
  const inputs = clips.map((c, i) => `-i "${c.file}"`).join(' ')
  const delays = clips.map((c, i) => {
    const delayMs = c.timestamp - startTimestamp
    return `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`
  })
  const mixInputs = clips.map((_, i) => `[a${i}]`).join('')
  const filter = [
    ...delays,
    `${mixInputs}amix=inputs=${clips.length}:duration=longest:normalize=0[aout]`
  ].join(';')

  const cmd = `ffmpeg -y -i "${videoPath}" ${inputs} -filter_complex "${filter}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k "${outputPath}"`

  console.log(`[compose] Mixing ${clips.length} audio clips into video...`)
  execSync(cmd, { stdio: 'inherit' })
  console.log(`[compose] Output: ${outputPath}`)
}
