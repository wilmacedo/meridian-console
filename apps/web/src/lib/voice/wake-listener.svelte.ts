import workletUrl from './wake-capture-worklet.ts?worker&url'
import { audioContext } from './voice-player.svelte'
import type { WakeWorkerIn, WakeWorkerOut } from './wake-worker'

// Listens for the wake word with the microphone open for as long as the page is on screen. Nothing leaves the device:
// the audio goes to the models in a worker, and only a recording the word starts is sent, like one a tap starts.
export const wake = $state({
  // What to say, from the server; empty when it has no wake word model, and then there is nothing to switch on.
  phrase: '',
  listening: false,
})

// About 2 s of audio before the word was recognised: the word itself, which the server looks for in the transcript,
// and whatever the owner said right after it, without waiting.
const PRE_ROLL = 25

let wanted = false
let stream: MediaStream | undefined
let source: MediaStreamAudioSourceNode | undefined
let node: AudioWorkletNode | undefined
let worker: Worker | undefined
let workletLoaded: Promise<void> | undefined
let recent: Float32Array[] = []
let capture: Float32Array[] | undefined
let onScore: ((score: number) => void) | undefined

export const setWakeScoreHandler = (fn: (score: number) => void): void => void (onScore = fn)

// The stream the listener holds open, which a recording uses instead of opening the microphone again.
export const wakeStream = (): MediaStream | undefined => stream

export async function loadWakeWord(): Promise<void> {
  try {
    const res = await fetch('/api/voice/wake')
    wake.phrase = res.ok ? ((await res.json()) as { phrase: string }).phrase : ''
  } catch {
    wake.phrase = ''
  }
}

// Starts from the next chunk with the last PRE_ROLL already in it.
export const startCapture = (): void => void (capture = recent.slice(-PRE_ROLL))

export function takeCapture(): Float32Array<ArrayBuffer> | undefined {
  const chunks = capture
  capture = undefined
  if (!chunks) return undefined
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

// A page that is not on screen does not listen: the microphone and the models stop until it is back.
export function syncWake(on: boolean): void {
  wanted = on
  void apply()
}

let applying: Promise<void> = Promise.resolve()
const apply = (): Promise<void> =>
  (applying = applying.then(async () => {
    const should = wanted && !document.hidden
    if (should && !stream) await start()
    else if (!should && stream) stop()
  }))

document.addEventListener('visibilitychange', () => void apply())

async function start(): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    const ctx = audioContext()
    await (workletLoaded ??= ctx.audioWorklet.addModule(workletUrl))
    source = ctx.createMediaStreamSource(stream)
    node = new AudioWorkletNode(ctx, 'wake-capture', { numberOfOutputs: 0 })
    source.connect(node)
  } catch (err) {
    console.warn('wake word: no microphone', err)
    return stop()
  }
  worker = new Worker(new URL('./wake-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WakeWorkerOut>) => {
    if (e.data.type === 'score') onScore?.(e.data.score)
    else if (e.data.type === 'error') {
      console.warn('wake word:', e.data.message)
      stop()
    }
  }
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    recent.push(e.data)
    if (recent.length > PRE_ROLL) recent.shift()
    capture?.push(e.data)
    worker?.postMessage({ type: 'chunk', samples: e.data } satisfies WakeWorkerIn)
  }
  wake.listening = true
}

function stop(): void {
  worker?.terminate()
  node?.port.close()
  source?.disconnect()
  stream?.getTracks().forEach((t) => t.stop())
  worker = undefined
  node = undefined
  source = undefined
  stream = undefined
  recent = []
  capture = undefined
  wake.listening = false
}
