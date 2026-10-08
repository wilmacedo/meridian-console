import { createDownsampler } from './downsample'
import { CHUNK, SAMPLE_RATE } from './wake-pipeline'

// The AudioWorkletGlobalScope, which TypeScript's DOM library does not describe.
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor & { process(inputs: Float32Array[][]): boolean }): void

// Hands the main thread the microphone at 16 kHz, in the 80 ms chunks the wake word's models take.
class WakeCapture extends AudioWorkletProcessor {
  private downsample = createDownsampler(sampleRate, SAMPLE_RATE)
  private chunk = new Float32Array(CHUNK)
  private filled = 0

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (const sample of this.downsample(channel)) {
      this.chunk[this.filled++] = sample
      if (this.filled < CHUNK) continue
      this.port.postMessage(this.chunk, [this.chunk.buffer])
      this.chunk = new Float32Array(CHUNK)
      this.filled = 0
    }
    return true
  }
}

registerProcessor('wake-capture', WakeCapture)
