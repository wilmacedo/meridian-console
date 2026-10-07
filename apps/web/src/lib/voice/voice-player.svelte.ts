import { agent } from '../agent/agent-state.svelte'

// Plays NOX's speech: the server sends each sentence as an mp3, in order, and the player decodes and
// chains them. The level of what is actually playing drives the orb (agent.amplitude).
export const player = $state({ active: false })

let ctx: AudioContext | undefined
let analyser: AnalyserNode | undefined
let turn = -1
// Decoded sentences by sequence number, since decoding can finish out of order.
let ready = new Map<number, AudioBuffer>()
let nextSeq = 0
let decoding = 0
let ended = false
let playing = false
let source: AudioBufferSourceNode | undefined
let raf = 0
let onFinished: ((turn: number) => void) | undefined

export const setPlaybackFinished = (fn: (turn: number) => void): void => void (onFinished = fn)

// Browsers only let a page play audio after the user has interacted with it; this runs on the first gesture.
export function unlockAudio(): void {
  ctx ??= new AudioContext()
  analyser ??= (() => {
    const a = ctx!.createAnalyser()
    a.fftSize = 512
    a.smoothingTimeConstant = 0.3
    a.connect(ctx!.destination)
    return a
  })()
  if (ctx.state === 'suspended') void ctx.resume()
}

function meter(): void {
  const data = new Float32Array(analyser!.fftSize)
  analyser!.getFloatTimeDomainData(data)
  const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
  agent.amplitude = Math.min(1, rms * 4)
  raf = requestAnimationFrame(meter)
}

function stop(): void {
  source?.stop()
  source = undefined
  playing = false
  cancelAnimationFrame(raf)
  player.active = false
  agent.amplitude = 0
}

function finishIfDone(): void {
  if (!ended || playing || decoding > 0 || ready.size > 0) return
  stop()
  onFinished?.(turn)
}

async function playNext(): Promise<void> {
  const buffer = ready.get(nextSeq)
  if (playing || !buffer || !ctx || !analyser) return finishIfDone()
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  // Still locked (no gesture yet): the sentence waits, and the next unlock tries again.
  if (ctx.state !== 'running') return
  ready.delete(nextSeq++)
  playing = true
  player.active = true
  const node = ctx.createBufferSource()
  node.buffer = buffer
  node.connect(analyser)
  node.onended = () => {
    if (source !== node) return
    playing = false
    void playNext()
  }
  source = node
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(meter)
  node.start()
}

function startTurn(next: number): void {
  stop()
  turn = next
  ready = new Map()
  nextSeq = 0
  decoding = 0
  ended = false
}

export async function enqueueSpeech(speechTurn: number, seq: number, base64: string): Promise<void> {
  unlockAudio()
  if (speechTurn > turn) startTurn(speechTurn)
  else if (speechTurn < turn) return
  decoding++
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    ready.set(seq, await ctx!.decodeAudioData(bytes.buffer))
  } catch {
    // An undecodable sentence is skipped rather than blocking the ones after it.
    ready.set(seq, ctx!.createBuffer(1, 1, ctx!.sampleRate))
  } finally {
    decoding--
  }
  void playNext()
}

export function endSpeech(speechTurn: number): void {
  if (speechTurn !== turn) return
  ended = true
  finishIfDone()
}

// A new gesture may be what lets queued speech start.
export function retryPlayback(): void {
  void playNext()
}
