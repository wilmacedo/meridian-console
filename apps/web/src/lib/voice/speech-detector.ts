// Decides, from the microphone level sampled every tick, whether the owner is speaking and when they are done.
export interface Tuning {
  // A tick is voiced above this level, even in a silent room.
  minLevel: number
  // How far above the room's noise a tick has to be. 1 keeps the threshold fixed at `minLevel`.
  floorRatio: number
  // Voice has to last this long to count as speech; a door slam or a horn is shorter.
  minVoicedMs: number
  silenceMs: number
  // Only a guard for a room that never goes quiet.
  maxMs: number
}

export const DEFAULT_TUNING: Tuning = { minLevel: 0.02, floorRatio: 1, minVoicedMs: 0, silenceMs: 1000, maxMs: 10 * 60_000 }

// The room's noise is read off the quiet part of the last seconds, before any speech: once the owner is talking the
// reading is frozen, so their own pauses cannot raise the bar and cut them off.
const FLOOR_WINDOW = 60
const FLOOR_WARMUP = 20
const FLOOR_PERCENTILE = 0.2

export type Verdict = 'send' | 'drop'

// `knownFloor` is what the previous recording measured: the room does not change in a few seconds, so a quick reply
// can be judged at once instead of after the first second of listening.
export function createDetector(tuning: Tuning, startedAt: number, noSpeechMs: number, knownFloor = 0) {
  const recent: number[] = []
  let floor = knownFloor
  let voicedSince: number | undefined
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
      if (voiced && !learning) {
        voicedSince ??= now
        if (now - voicedSince >= tuning.minVoicedMs) {
          heard = true
          lastSpeechAt = now
        }
      } else voicedSince = undefined

      if (heard && now - lastSpeechAt > tuning.silenceMs) return 'send'
      if (!heard && now - startedAt > noSpeechMs) return 'drop'
      if (now - startedAt > tuning.maxMs) return heard ? 'send' : 'drop'
    },
  }
}
