import { describe, expect, it } from 'vitest'
import { wav } from './clip-encoder'
import { oggCrc, oggOpus, opusHead } from './ogg-opus'

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)

function pages(file: Uint8Array) {
  const out: { flags: number; granule: bigint; sequence: number; segments: number[]; start: number; length: number }[] = []
  for (let at = 0; at < file.length; ) {
    expect(new TextDecoder().decode(file.subarray(at, at + 4))).toBe('OggS')
    const count = file[at + 26]
    const segments = [...file.subarray(at + 27, at + 27 + count)]
    const length = 27 + count + segments.reduce((a, b) => a + b, 0)
    const copy = file.slice(at, at + length)
    const crc = view(copy).getUint32(22, true)
    view(copy).setUint32(22, 0, true)
    expect(oggCrc(copy)).toBe(crc)
    out.push({ flags: file[at + 5], granule: view(file).getBigInt64(at + 6, true), sequence: view(file).getUint32(at + 18, true), segments, start: at, length })
    at += length
  }
  return out
}

describe('oggOpus', () => {
  it('uses the CRC Ogg specifies', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f)
  })

  it('writes the two header pages and then the audio, ending where the input does', () => {
    const packets = Array.from({ length: 300 }, (_, i) => ({ data: new Uint8Array(60).fill(i % 256), duration: 20_000 }))
    const file = oggOpus(opusHead(312, 16_000), packets, 16_000 * 6 - 100, 16_000)
    const ps = pages(file)
    expect(ps.map((p) => p.sequence)).toEqual(ps.map((_, i) => i))
    expect(ps[0].flags).toBe(0x02)
    expect(new TextDecoder().decode(file.subarray(28, 36))).toBe('OpusHead')
    expect(ps.at(-1)!.flags).toBe(0x04)
    expect(ps.slice(2).every((p) => p.segments.length <= 255)).toBe(true)
    expect(ps.slice(2).reduce((n, p) => n + p.segments.length, 0)).toBe(300)
    expect(ps.at(-1)!.granule).toBe(BigInt(312 + (16_000 * 6 - 100) * 3))
    expect(ps[2].granule).toBe(BigInt(312 + ps[2].segments.length * 960))
  })

  it('laces a packet longer than 255 bytes', () => {
    const file = oggOpus(opusHead(312, 16_000), [{ data: new Uint8Array(600), duration: 20_000 }], 320, 16_000)
    expect(pages(file)[2].segments).toEqual([255, 255, 90])
  })
})

describe('wav', () => {
  it('writes 16-bit mono at 16 kHz', async () => {
    const blob = wav(Float32Array.from([0, 1, -1, 2]))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF')
    expect(view(bytes).getUint32(24, true)).toBe(16_000)
    expect([1, 2, 3, 4].slice(0, 4).map((_, i) => view(bytes).getInt16(44 + i * 2, true))).toEqual([0, 32767, -32767, 32767])
  })
})
