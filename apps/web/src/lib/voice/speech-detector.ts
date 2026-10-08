// Decides, from the microphone level sampled every tick, whether the owner is speaking and when they are done.
export interface Tuning {
  // A tick is voiced above this level, even in a silent room.
  minLevel: number
  // How far above the room's noise a tick has to be. 1 keeps the threshold fixed at `minLevel`.
  floorRatio: number
  // Voice has to add up to this much within about half a second to count as speech (dips between words are fine); a
  // door slam or a horn is shorter.
  minVoicedMs: number
  // How long after the last speech the recording ends when the room is quiet.
  silenceMs: number
  // The same, when the room is loud but what is there is not speech (see `flatCv`): longer, since it may be a doubt.
  noiseEndMs: number
  // Speech rises and falls from syllable to syllable; an engine, a horn or a fan holds one level. A loud stretch whose
  // level varies less than this (std / mean over half a second) is noise. 0 trusts the level alone.
  flatCv: number
  // Only a guard for a room that never goes quiet.
  maxMs: number
}

export const DEFAULT_TUNING: Tuning = { minLevel: 0.02, floorRatio: 1, minVoicedMs: 0, silenceMs: 1000, noiseEndMs: 1000, flatCv: 0, maxMs: 10 * 60_000 }

// The room's noise is read off the quiet part of the last seconds, before any speech: once the owner is talking the
// reading is frozen, so their own pauses cannot raise the bar and cut them off.
const FLOOR_WINDOW = 60
const FLOOR_WARMUP = 20
const FLOOR_PERCENTILE = 0.2
const FLAT_WINDOW = 10
const SPEECH_WINDOW_MS = 600

function variation(levels: number[]): number {
  const mean = levels.reduce((sum, v) => sum + v, 0) / levels.length
  return Math.sqrt(levels.reduce((sum, v) => sum + (v - mean) ** 2, 0) / levels.length) / mean
}

export type Verdict = 'send' | 'drop'

// `knownFloor` is what the previous recording measured: the room does not change in a few seconds, so a quick reply
// can be judged at once instead of after the first second of listening.
export function createDetector(tuning: Tuning, startedAt: number, noSpeechMs: number, knownFloor = 0) {
  const recent: number[] = []
  // The levels of the ticks in a row that were voiced.
  let voicedRun: number[] = []
  let floor = knownFloor
  // When speech-like ticks happened lately and how long each stood for.
  let lately: { at: number; ms: number }[] = []
  let previous = startedAt
  let heard = false
  let lastSpeechAt = startedAt

  return {
    get heardSpeech(): boolean {
      return heard
    },
    get floor(): number {
      return floor
    },
    // `send` when the recording should go to NOX, `drop` when it should be thrown away, nothing to keep going.
    push(level: number, now: number): Verdict | undefined {
      const voiced = level > Math.max(tuning.minLevel, floor * tuning.floorRatio)
      if (!heard) {
        recent.push(level)
        if (recent.length > FLOOR_WINDOW) recent.shift()
        if (recent.length >= FLOOR_WARMUP) floor = [...recent].sort((a, b) => a - b)[Math.floor(recent.length * FLOOR_PERCENTILE)]
      }
      // Steady noise cannot be told from speech until the room has been heard for a moment.
      const learning = tuning.floorRatio > 1 && floor === 0 && recent.length < FLOOR_WARMUP
      voicedRun = voiced ? [...voicedRun, level].slice(-FLAT_WINDOW) : []
      // A stretch is judged only once it has lasted the whole window, so the start of a sound is never taken for noise.
      const flat = tuning.flatCv > 0 && voicedRun.length === FLAT_WINDOW && variation(voicedRun) < tuning.flatCv
      const ms = now - previous
      previous = now
      lately = lately.filter((t) => now - t.at <= SPEECH_WINDOW_MS)
      if (voiced && !learning && !flat) {
        lately.push({ at: now, ms })
        if (lately.reduce((sum, t) => sum + t.ms, 0) >= tuning.minVoicedMs) {
          heard = true
          lastSpeechAt = now
        }
      }

      if (heard && now - lastSpeechAt > (voiced ? tuning.noiseEndMs : tuning.silenceMs)) return 'send'
      if (!heard && now - startedAt > noSpeechMs) return 'drop'
      if (now - startedAt > tuning.maxMs) return heard ? 'send' : 'drop'
    },
  }
}
