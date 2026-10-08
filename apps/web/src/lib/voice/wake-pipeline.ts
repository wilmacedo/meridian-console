// openWakeWord's streaming pipeline (github.com/dscripka/openWakeWord, utils.py `AudioFeatures`): every 80 ms of
// 16 kHz audio becomes 8 mel frames, the last 76 mel frames become one 96-value embedding, and the classifier of the
// wake word scores the last `featureFrames` embeddings. The models sit behind plain functions so the same pipeline
// runs in the browser and in tests.
export interface WakeModels {
  // Samples in the int16 range (as floats) to mel frames, flattened `frames × MEL_BINS`.
  melspectrogram(samples: Float32Array): Promise<Float32Array>
  // `MEL_WINDOW × MEL_BINS` mel values to one embedding of `EMBEDDING` values.
  embedding(mel: Float32Array): Promise<Float32Array>
  // `featureFrames × EMBEDDING` values to the wake word's score, 0 to 1.
  classify(features: Float32Array): Promise<number>
}

// 80 ms at 16 kHz: what the models are built around.
export const CHUNK = 1280
export const SAMPLE_RATE = 16_000
export const MEL_BINS = 32
export const MEL_WINDOW = 76
export const EMBEDDING = 96
// The mel model needs three hops of the previous chunk to produce the frames of this one.
const MEL_CONTEXT = 160 * 3

export interface WakePipeline {
  // Scores the chunk; 0 until there is enough history for the classifier.
  push(chunk: Float32Array): Promise<number>
  reset(): void
}

export function createWakePipeline(models: WakeModels, featureFrames: number): WakePipeline {
  let raw = new Float32Array(MEL_CONTEXT)
  let mel: Float32Array[] = []
  let features: Float32Array[] = []

  const reset = (): void => {
    raw = new Float32Array(MEL_CONTEXT)
    // The reference starts the mel history at ones, so the first embeddings see the same thing it does.
    mel = Array.from({ length: MEL_WINDOW }, () => new Float32Array(MEL_BINS).fill(1))
    features = []
  }
  reset()

  return {
    reset,
    async push(chunk) {
      const input = new Float32Array(MEL_CONTEXT + chunk.length)
      input.set(raw)
      input.set(chunk, MEL_CONTEXT)
      raw = input.slice(-MEL_CONTEXT)

      const frames = await models.melspectrogram(input)
      for (let i = 0; i + MEL_BINS <= frames.length; i += MEL_BINS) mel.push(frames.slice(i, i + MEL_BINS).map((v) => v / 10 + 2))
      mel = mel.slice(-MEL_WINDOW)

      const window = new Float32Array(MEL_WINDOW * MEL_BINS)
      mel.forEach((frame, i) => window.set(frame, i * MEL_BINS))
      features.push(await models.embedding(window))
      if (features.length > featureFrames) features.shift()
      if (features.length < featureFrames) return 0

      const stacked = new Float32Array(featureFrames * EMBEDDING)
      features.forEach((f, i) => stacked.set(f, i * EMBEDDING))
      return models.classify(stacked)
    },
  }
}
