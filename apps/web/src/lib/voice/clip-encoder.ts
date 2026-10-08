import { oggOpus, opusHead, type OpusPacket } from './ogg-opus'
import { SAMPLE_RATE } from './wake-pipeline'

// A recording made from raw samples (the one a wake word starts, which begins before the word was recognised) goes
// to the server as Opus: on mobile data a WAV would be about eight times as large. WAV is the fallback for a browser
// without WebCodecs.
const BITRATE = 24_000
// libopus' lookahead at 48 kHz, for an encoder that does not say what it uses.
const DEFAULT_PRE_SKIP = 312

export async function encodeClip(samples: Float32Array<ArrayBuffer>): Promise<Blob> {
  return (await opus(samples).catch(() => undefined)) ?? wav(samples)
}

async function opus(samples: Float32Array<ArrayBuffer>): Promise<Blob | undefined> {
  if (typeof AudioEncoder === 'undefined' || !samples.length) return undefined
  const config: AudioEncoderConfig = { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: BITRATE }
  if (!(await AudioEncoder.isConfigSupported(config)).supported) return undefined
  const packets: OpusPacket[] = []
  let head: Uint8Array | undefined
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      packets.push({ data, duration: chunk.duration ?? 20_000 })
      const description = meta?.decoderConfig?.description
      if (description && !head) head = ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description)
    },
    error: () => undefined,
  })
  encoder.configure(config)
  encoder.encode(new AudioData({ format: 'f32', sampleRate: SAMPLE_RATE, numberOfFrames: samples.length, numberOfChannels: 1, timestamp: 0, data: samples }))
  await encoder.flush()
  encoder.close()
  if (!packets.length) return undefined
  const isHead = head && head.length >= 19 && new TextDecoder().decode(head.subarray(0, 8)) === 'OpusHead'
  return new Blob([oggOpus(isHead ? head! : opusHead(DEFAULT_PRE_SKIP, SAMPLE_RATE), packets, samples.length, SAMPLE_RATE)], { type: 'audio/ogg' })
}

export function wav(samples: Float32Array): Blob {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, s: string): void => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  out.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 1, true)
  out.setUint32(24, SAMPLE_RATE, true)
  out.setUint32(28, SAMPLE_RATE * 2, true)
  out.setUint16(32, 2, true)
  out.setUint16(34, 16, true)
  text(36, 'data')
  out.setUint32(40, samples.length * 2, true)
  samples.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true))
  return new Blob([out.buffer], { type: 'audio/wav' })
}
