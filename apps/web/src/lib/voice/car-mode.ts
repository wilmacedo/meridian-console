import { DEFAULT_TUNING, type Tuning } from './speech-detector'

// The workspace opened from the car: a noisy cabin, and a Bluetooth link that drops the start and the end of what
// it plays. Every knob can be overridden in the address while it is being tuned: ?noise=off|normal|strict,
// ?warmup=off, ?tail=<ms>, ?audiosession=playback|play-and-record.
const CAR_WORKSPACE = 'carplay'

const param = (name: string): string | null => new URLSearchParams(location.search).get(name)

// The address always names the workspace this screen shows (switching one rewrites it).
export const isCarMode = (): boolean => param('workspace') === CAR_WORKSPACE

export type Noise = 'off' | 'normal' | 'strict'

export function noiseLevel(): Noise {
  const asked = param('noise')
  return isCarMode() ? (asked === 'off' || asked === 'strict' ? asked : 'normal') : 'off'
}

const CAR_TUNING: Record<Exclude<Noise, 'off'>, Tuning> = {
  normal: { minLevel: 0.02, floorRatio: 2.5, minVoicedMs: 250, silenceMs: 1000, maxMs: 30_000 },
  strict: { minLevel: 0.03, floorRatio: 3.5, minVoicedMs: 400, silenceMs: 900, maxMs: 30_000 },
}

export const tuning = (): Tuning => {
  const level = noiseLevel()
  return level === 'off' ? DEFAULT_TUNING : CAR_TUNING[level]
}

export const warmupWanted = (): boolean => isCarMode() && param('warmup') !== 'off'

// Silence the Bluetooth link must be given after the last word, before anything else touches the audio route.
const TAIL_MS = 500
export const tailMs = (outputLatencySeconds: number): number => Number(param('tail') ?? TAIL_MS) + outputLatencySeconds * 1000

// Experiment: ask the system for a fixed audio session instead of letting it switch with the microphone.
export function applyAudioSession(): void {
  const wanted = param('audiosession')
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (isCarMode() && session && (wanted === 'playback' || wanted === 'play-and-record')) session.type = wanted
}
