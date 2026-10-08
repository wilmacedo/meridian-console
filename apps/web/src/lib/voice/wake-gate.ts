// The wake word's embedding model costs several ms per 80 ms chunk, which adds up on a phone, and most of the day the
// room is quiet. The models run only while a chunk stands out from the room's noise, and a moment after.
const HISTORY = 60
const FLOOR_PERCENTILE = 0.2
const FLOOR_RATIO = 2
// In the int16 range (about -44 dBFS): below it nothing is loud, however quiet the room.
const MIN_RMS = 200
const HANGOVER = 20

export const rms = (samples: Float32Array): number => Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length)

// `push` takes a chunk's RMS and says whether the models should run on it.
export function createGate() {
  const levels: number[] = []
  let openFor = 0
  return {
    push(level: number): boolean {
      const floor = levels.length ? [...levels].sort((a, b) => a - b)[Math.floor(levels.length * FLOOR_PERCENTILE)] : 0
      levels.push(level)
      if (levels.length > HISTORY) levels.shift()
      openFor = level > Math.max(MIN_RMS, floor * FLOOR_RATIO) ? HANGOVER : Math.max(0, openFor - 1)
      return openFor > 0
    },
  }
}
