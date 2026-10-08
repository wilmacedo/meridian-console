import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const API = 'https://api.elevenlabs.io/v1/speech-to-text'
const DEFAULT_MODEL = 'scribe_v2'
const MAX_BYTES = 25 * 1024 * 1024

interface ScribeWord {
  text: string
  type: 'word' | 'spacing' | 'audio_event'
}

// The spoken words only: Scribe also describes sounds like "(laughter)", which are not part of the message.
export function spokenText(response: { text?: string; words?: ScribeWord[] }): string {
  const text = response.words ? response.words.filter((w) => w.type !== 'audio_event').map((w) => w.text).join('') : (response.text ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  return text.replace(/\s+/g, ' ').trim()
}

// Transcribes a voice note with the same ElevenLabs key NOX's own listening uses. The language is left to the
// model, since the people who write to the owner do not all speak the same one.
export async function transcribeFile(path: string, doFetch: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const apiKey = env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set, so voice notes cannot be transcribed')
  const audio = await readFile(path)
  if (audio.length > MAX_BYTES) throw new Error('that audio is too large to transcribe')

  const form = new FormData()
  form.set('model_id', env.ELEVENLABS_STT_MODEL || DEFAULT_MODEL)
  form.set('tag_audio_events', 'false')
  form.set('file', new Blob([new Uint8Array(audio)], { type: 'audio/ogg' }), basename(path))
  const response = await doFetch(API, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status} when transcribing`)
  return spokenText((await response.json()) as { text?: string; words?: ScribeWord[] })
}
