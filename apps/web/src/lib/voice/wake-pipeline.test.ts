import { describe, expect, it } from 'vitest'
import { CHUNK, createWakePipeline, EMBEDDING, MEL_BINS, MEL_WINDOW, type WakeModels } from './wake-pipeline'

// Models that report what they were given, so the pipeline's bookkeeping can be checked without ONNX.
function recording(featureFrames: number) {
  const calls = { mel: [] as number[], embedding: [] as Float32Array[], classify: [] as Float32Array[] }
  let chunk = 0
  const models: WakeModels = {
    async melspectrogram(samples) {
      calls.mel.push(samples.length)
      chunk++
      return new Float32Array(8 * MEL_BINS).fill(chunk * 10 - 20)
    },
    async embedding(mel) {
      calls.embedding.push(mel)
      return new Float32Array(EMBEDDING).fill(mel[mel.length - 1])
    },
    async classify(features) {
      calls.classify.push(features)
      return 0.5
    },
  }
  return { calls, pipeline: createWakePipeline(models, featureFrames) }
}

describe('createWakePipeline', () => {
  it('gives the mel model each chunk with three hops of the one before', async () => {
    const { calls, pipeline } = recording(2)
    await pipeline.push(new Float32Array(CHUNK))
    await pipeline.push(new Float32Array(CHUNK))
    expect(calls.mel).toEqual([CHUNK + 480, CHUNK + 480])
  })

  it('scores nothing until the classifier has its history, then the last embeddings', async () => {
    const { calls, pipeline } = recording(2)
    expect(await pipeline.push(new Float32Array(CHUNK))).toBe(0)
    expect(await pipeline.push(new Float32Array(CHUNK))).toBe(0.5)
    expect(calls.embedding[0]).toHaveLength(MEL_WINDOW * MEL_BINS)
    expect(calls.classify[0]).toHaveLength(2 * EMBEDDING)
  })

  it('scales the mel frames like the reference and keeps the newest window', async () => {
    const { calls, pipeline } = recording(1)
    await pipeline.push(new Float32Array(CHUNK))
    // The first chunk's frames are -10, scaled to -10 / 10 + 2 = 1, after a history of ones.
    expect(calls.embedding[0].every((v) => v === 1)).toBe(true)
    await pipeline.push(new Float32Array(CHUNK))
    expect(calls.embedding[1].at(-1)).toBeCloseTo(0 / 10 + 2)
  })

  it('starts over on reset', async () => {
    const { calls, pipeline } = recording(2)
    await pipeline.push(new Float32Array(CHUNK))
    pipeline.reset()
    expect(await pipeline.push(new Float32Array(CHUNK))).toBe(0)
    expect(calls.classify).toHaveLength(0)
  })
})
