import { ElevenLabsError, type VoiceConfig } from './elevenlabs.js'

const API = 'https://api.elevenlabs.io'
const DEFAULT_STT_MODEL = 'scribe_v2'

// Words the model must get right even though they are not Portuguese: it hears "aqw-idle" as "Aquedol"
// unless it is told what to expect. Service names are added at call time.
export const BASE_KEYTERMS = ['Meridian', 'NOX', 'deploy', 'logs', 'container', 'telemetria', 'Docker']

export const keytermsFor = (serviceNames: string[]): string[] => [...new Set([...BASE_KEYTERMS, ...serviceNames])]

// What was said in a recording of the owner (any container the browser's MediaRecorder produces).
export async function transcribe(config: VoiceConfig, audio: Buffer, mime: string, keyterms: string[]): Promise<string> {
  const form = new FormData()
  form.set('model_id', process.env.ELEVENLABS_STT_MODEL || DEFAULT_STT_MODEL)
  form.set('language_code', 'por')
  for (const term of keyterms) form.append('keyterms', term)
  form.set('file', new Blob([new Uint8Array(audio)], { type: mime }), 'speech')
  const res = await fetch(`${API}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': config.apiKey }, body: form, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: { message?: string } | string }
      detail = typeof body.detail === 'string' ? body.detail : (body.detail?.message ?? '')
    } catch {
      // No JSON body.
    }
    throw new ElevenLabsError(`ElevenLabs answered ${res.status}${detail ? `: ${detail}` : ''}`, res.status)
  }
  return ((await res.json()) as { text: string }).text.trim()
}
