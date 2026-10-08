import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const API = 'https://api.elevenlabs.io/v1/text-to-speech'
const DEFAULT_MODEL = 'eleven_flash_v2_5'

// Speaks a text with the owner's own NOX voice and returns the audio file, which the bridge turns into a voice note.
export async function speakToFile(text: string, dir: string, doFetch: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const { ELEVENLABS_API_KEY: apiKey, ELEVENLABS_VOICE_ID: voiceId } = env
  if (!apiKey || !voiceId) throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are not set, so a text cannot be spoken')
  const response = await doFetch(`${API}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || DEFAULT_MODEL }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status} when speaking`)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, `voice-${Date.now()}.mp3`)
  await writeFile(path, Buffer.from(await response.arrayBuffer()), { mode: 0o600 })
  return path
}
