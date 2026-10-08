import { describe, expect, it } from 'vitest'
import { createDetector, DEFAULT_TUNING, type Tuning, type Verdict } from './speech-detector'

const TICK = 50
const CAR: Tuning = { minLevel: 0.02, floorRatio: 2.5, minVoicedMs: 250, silenceMs: 1000, maxMs: 30_000 }

// Feeds [level, ms] segments and returns the verdict with the time it came at.
function run(tuning: Tuning, segments: [number, number][], noSpeechMs = 5000, knownFloor = 0): { verdict?: Verdict; at: number; heard: boolean } {
  const detector = createDetector(tuning, 0, noSpeechMs, knownFloor)
  let now = 0
  for (const [level, ms] of segments) {
    for (let t = 0; t < ms; t += TICK) {
      now += TICK
      const verdict = detector.push(level, now)
      if (verdict) return { verdict, at: now, heard: detector.heardSpeech }
    }
  }
  return { at: now, heard: detector.heardSpeech }
}

describe('speech detector', () => {
  it('sends after the pause that follows speech', () => {
    const r = run(DEFAULT_TUNING, [[0.005, 500], [0.2, 1500], [0.005, 3000]])
    expect(r.verdict).toBe('send')
    expect(r.at).toBeLessThan(3200)
  })

  it('keeps listening through a short pause inside a sentence', () => {
    const r = run(DEFAULT_TUNING, [[0.2, 1000], [0.005, 600], [0.2, 1000], [0.005, 400]])
    expect(r.verdict).toBeUndefined()
  })

  it('gives up when nobody spoke', () => {
    expect(run(DEFAULT_TUNING, [[0.005, 9000]], 5000)).toMatchObject({ verdict: 'drop', heard: false })
  })

  it('counts a door slam as speech with the plain tuning', () => {
    expect(run(DEFAULT_TUNING, [[0.005, 500], [0.4, 100], [0.005, 3000]])).toMatchObject({ verdict: 'send', heard: true })
  })

  it('ignores a door slam or a horn in the car tuning', () => {
    expect(run(CAR, [[0.005, 500], [0.4, 150], [0.005, 9000]], 5000)).toMatchObject({ verdict: 'drop', heard: false })
  })

  it('still hears a sentence in the car tuning', () => {
    expect(run(CAR, [[0.005, 500], [0.2, 1500], [0.005, 3000]])).toMatchObject({ verdict: 'send', heard: true })
  })

  it('finds the end of speech over steady noise, where a fixed threshold never does', () => {
    const noisy: [number, number][] = [[0.05, 3000], [0.25, 1500], [0.05, 4000]]
    expect(run(CAR, noisy).verdict).toBe('send')
    expect(run({ ...DEFAULT_TUNING, maxMs: 8000 }, noisy).verdict).toBe('send')
    expect(run({ ...DEFAULT_TUNING, maxMs: 8000 }, noisy).at).toBeGreaterThan(7900)
  })

  it('does not cut the owner off when their pauses are louder than the room', () => {
    const r = run(CAR, [[0.05, 3000], [0.25, 800], [0.07, 400], [0.25, 800], [0.05, 200]])
    expect(r.verdict).toBeUndefined()
  })

  it('hears a quick reply at once when the room was measured before', () => {
    const r = run(CAR, [[0.2, 1500], [0.05, 3000]], 5000, 0.05)
    expect(r).toMatchObject({ verdict: 'send', heard: true })
  })

  it('caps a recording of speech that never ends', () => {
    expect(run({ ...CAR, maxMs: 4000 }, [[0.005, 1000], [0.3, 10_000]])).toMatchObject({ verdict: 'send', at: 4050 })
  })

  it('treats a sound that starts loud and never changes as the room, not as speech', () => {
    expect(run({ ...CAR, maxMs: 4000 }, [[0.3, 10_000]])).toMatchObject({ verdict: 'drop', heard: false })
  })
})
