import { ElevenLabsError, type VoiceConfig } from './elevenlabs.js'

const API = 'https://api.elevenlabs.io'
const DEFAULT_STT_MODEL = 'scribe_v2'

// Words the model must get right even though they are not Portuguese: it hears "aqw-idle" as "Aquedol"
// unless it is told what to expect. Service names are added at call time.
export const BASE_KEYTERMS = ['Meridian', 'NOX', 'deploy', 'logs', 'container', 'telemetria', 'Docker']

export const keytermsFor = (serviceNames: string[]): string[] => [...new Set([...BASE_KEYTERMS, ...serviceNames])]

interface ScribeWord {
  text: string
  type: 'word' | 'spacing' | 'audio_event'
  logprob?: number
}

export interface Heard {
  text: string
  // Number of spoken words, and the mean log-probability the model gave them (0 is certain).
  words: number
  confidence: number
}

// How much a recording has to look like speech before it is answered. `strict` is for a noisy place (the car).
export type Strictness = 'normal' | 'strict'

const MIN_WORDS: Record<Strictness, number> = { normal: 1, strict: 2 }
const MIN_CONFIDENCE: Record<Strictness, number> = { normal: -Infinity, strict: -1 }

export const isSpeech = (heard: Heard, strictness: Strictness): boolean => heard.words >= MIN_WORDS[strictness] && heard.confidence >= MIN_CONFIDENCE[strictness]

// Scribe describes sounds that are not speech too, like "(batida de porta)": only the words are what the owner said.
export function speechOf(response: { text?: string; words?: ScribeWord[] }): Heard {
  if (!response.words) {
    const text = (response.text ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
    return { text, words: text ? text.split(' ').length : 0, confidence: 0 }
  }
  const spoken = response.words.filter((w) => w.type !== 'audio_event')
  const words = spoken.filter((w) => w.type === 'word')
  const logprobs = words.flatMap((w) => (w.logprob === undefined ? [] : [w.logprob]))
  return {
    text: spoken.map((w) => w.text).join('').replace(/\s+/g, ' ').trim(),
    words: words.length,
    confidence: logprobs.length ? logprobs.reduce((sum, v) => sum + v, 0) / logprobs.length : 0,
  }
}

// What was said in a recording of the owner (any container the browser's MediaRecorder produces).
export async function transcribe(config: VoiceConfig, audio: Buffer, mime: string, keyterms: string[]): Promise<Heard> {
  const form = new FormData()
  form.set('model_id', process.env.ELEVENLABS_STT_MODEL || DEFAULT_STT_MODEL)
  form.set('language_code', 'por')
  form.set('tag_audio_events', 'false')
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
  return speechOf((await res.json()) as { text?: string; words?: ScribeWord[] })
}
