export type WakeSensitivity = 'low' | 'normal' | 'high'

const THRESHOLD: Record<WakeSensitivity, number> = { low: 0.7, normal: 0.5, high: 0.3 }
// NOX's own voice reaches the microphone, echo cancellation or not, and may say something close to its name.
const SPEAKING_EXTRA = 0.2
const MAX_THRESHOLD = 0.95
// Chunks in a row above the threshold: a single loud score is more often a click than the word.
const PATIENCE = 2
// One utterance of the word keeps scoring high for a few chunks; it must wake NOX once.
const COOLDOWN_MS = 2000

export const thresholdFor = (sensitivity: WakeSensitivity, speaking: boolean): number => Math.min(MAX_THRESHOLD, THRESHOLD[sensitivity] + (speaking ? SPEAKING_EXTRA : 0))

// Turns the stream of scores, one per chunk, into wake-ups.
export function createTrigger() {
  let run = 0
  let last = -Infinity
  return {
    push(score: number, now: number, sensitivity: WakeSensitivity, speaking: boolean): boolean {
      run = score >= thresholdFor(sensitivity, speaking) && now - last >= COOLDOWN_MS ? run + 1 : 0
      if (run < PATIENCE) return false
      last = now
      run = 0
      return true
    },
  }
}
