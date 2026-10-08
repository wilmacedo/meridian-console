import { DEFAULT_TUNING, type Tuning } from './speech-detector'

// How the voice behaves in a workspace. A workspace in CarPlay mode starts with the noise filter and the Bluetooth
// warm-up on, because it is the one opened in a car: a noisy cabin, and a link that drops the start and the end of
// what it plays. Anything else starts plain. Every workspace can change them in Settings.
// The workspace with this id is the one that is in CarPlay mode until the owner says otherwise.
export const CAR_WORKSPACE = 'carplay'

export type NoiseLevel = 'off' | 'normal' | 'strict'
export type AudioSession = 'auto' | 'playback' | 'play-and-record'

export interface VoicePrefs {
  noise: NoiseLevel
  // Keep the Bluetooth link open while NOX thinks and a moment after its last word.
  warmup: boolean
  // Silence after the last word, before the microphone reopens (the output latency is added to it).
  tailMs: number
  // Fixes the system audio session instead of letting it follow the microphone; needs navigator.audioSession.
  audioSession: AudioSession
}

export const TAIL_MIN = 0
export const TAIL_MAX = 2000
export const TAIL_STEP = 100

const NOISE: readonly NoiseLevel[] = ['off', 'normal', 'strict']
const SESSIONS: readonly AudioSession[] = ['auto', 'playback', 'play-and-record']

export const defaultVoicePrefs = (carplay: boolean): VoicePrefs =>
  carplay ? { noise: 'normal', warmup: true, tailMs: 500, audioSession: 'auto' } : { noise: 'off', warmup: false, tailMs: 500, audioSession: 'auto' }

// Switching CarPlay mode moves the voice options to the new mode's defaults, but only the ones the owner never
// touched: if they differ from the old mode's defaults, they are theirs and stay.
export function followCarplay(current: VoicePrefs, from: boolean, to: boolean): VoicePrefs {
  const was = defaultVoicePrefs(from)
  const untouched = (Object.keys(was) as (keyof VoicePrefs)[]).every((k) => current[k] === was[k])
  return untouched ? defaultVoicePrefs(to) : current
}

// What was stored, field by field: a part that is missing or no longer valid falls back to the workspace's default.
export function sanitizeVoice(stored: unknown, carplay: boolean): VoicePrefs {
  const base = defaultVoicePrefs(carplay)
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>
  return {
    noise: NOISE.includes(s.noise as NoiseLevel) ? (s.noise as NoiseLevel) : base.noise,
    warmup: typeof s.warmup === 'boolean' ? s.warmup : base.warmup,
    tailMs: typeof s.tailMs === 'number' && Number.isFinite(s.tailMs) ? Math.min(TAIL_MAX, Math.max(TAIL_MIN, Math.round(s.tailMs / TAIL_STEP) * TAIL_STEP)) : base.tailMs,
    audioSession: SESSIONS.includes(s.audioSession as AudioSession) ? (s.audioSession as AudioSession) : base.audioSession,
  }
}

const TUNING: Record<Exclude<NoiseLevel, 'off'>, Tuning> = {
  normal: { minLevel: 0.02, floorRatio: 2.5, minVoicedMs: 250, silenceMs: 1000, noiseEndMs: 3500, flatCv: 0.15, maxMs: DEFAULT_TUNING.maxMs },
  strict: { minLevel: 0.03, floorRatio: 3.5, minVoicedMs: 400, silenceMs: 900, noiseEndMs: 3000, flatCv: 0.2, maxMs: DEFAULT_TUNING.maxMs },
}

export const tuningFor = (noise: NoiseLevel): Tuning => (noise === 'off' ? DEFAULT_TUNING : TUNING[noise])
