import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { createGate, rms } from './wake-gate'
import { createWakePipeline, EMBEDDING, MEL_BINS, MEL_WINDOW, type WakePipeline } from './wake-pipeline'

// Runs the wake word's models off the main thread. In: `chunk` messages, 80 ms of 16 kHz audio in [-1, 1].
// Out: `ready`, `error`, and a `score` for every chunk the models ran on.
export type WakeWorkerIn = { type: 'chunk'; samples: Float32Array }
export type WakeWorkerOut = { type: 'ready' } | { type: 'error'; message: string } | { type: 'score'; score: number }

// When the gate opens, the models are started over on the last chunks, so the word that opened it is heard whole:
// the classifier needs this much history before it scores anything.
const CATCH_UP = 20
const INT16 = 32768

const post = (message: WakeWorkerOut): void => postMessage(message)

ort.env.wasm.wasmPaths = { wasm: wasmUrl }
// Threads need a cross-origin isolated page, which this is not; one thread is plenty for these models.
ort.env.wasm.numThreads = 1

async function session(file: string): Promise<ort.InferenceSession> {
  const res = await fetch(`/api/voice/wake/${file}`)
  if (!res.ok) throw new Error(`${file}: ${res.status}`)
  return ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()))
}

async function run(s: ort.InferenceSession, data: Float32Array, dims: number[]): Promise<Float32Array> {
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', data, dims) })
  return out[s.outputNames[0]].data as Float32Array
}

async function load(): Promise<WakePipeline> {
  const [mel, embedding, wake] = await Promise.all([session('melspectrogram.onnx'), session('embedding_model.onnx'), session('wake.onnx')])
  const shape = wake.inputMetadata[0]
  const frames = shape?.isTensor && typeof shape.shape[1] === 'number' ? shape.shape[1] : 16
  return createWakePipeline(
    {
      melspectrogram: (samples) => run(mel, samples, [1, samples.length]),
      embedding: (window) => run(embedding, window, [1, MEL_WINDOW, MEL_BINS, 1]),
      classify: async (features) => (await run(wake, features, [1, frames, EMBEDDING]))[0],
    },
    frames,
  )
}

const ready = load()
ready.then(
  () => post({ type: 'ready' }),
  (err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : 'the wake word model did not load' }),
)

const gate = createGate()
const recent: Float32Array[] = []
let open = false
// Chunks are scored one at a time and in order: the pipeline keeps state between them.
let queue: Promise<void> = Promise.resolve()

onmessage = (e: MessageEvent<WakeWorkerIn>) => {
  const samples = e.data.samples.map((v) => v * INT16)
  recent.push(samples)
  if (recent.length > CATCH_UP) recent.shift()
  const wasOpen = open
  open = gate.push(rms(samples))
  if (!open) return
  const batch = wasOpen ? [samples] : [...recent]
  queue = queue.then(async () => {
    const pipeline = await ready.catch(() => undefined)
    if (!pipeline) return
    if (!wasOpen) pipeline.reset()
    for (const chunk of batch) post({ type: 'score', score: await pipeline.push(chunk) })
  })
}
