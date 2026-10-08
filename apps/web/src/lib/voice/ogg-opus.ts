// Wraps Opus packets from WebCodecs' AudioEncoder in an Ogg file (RFC 7845), the container the transcription takes.
// Opus timestamps always count at 48 kHz, whatever the input rate.
const OPUS_RATE = 48_000
const MAX_SEGMENTS = 255

const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let r = i << 24
  for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
  return r >>> 0
})

// Ogg's CRC: polynomial 0x04c11db7, no reflection, starting at 0, nothing xored at the end.
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0
  return crc
}

const lacing = (length: number): number[] => [...Array<number>(Math.floor(length / 255)).fill(255), length % 255]

const SERIAL = 0x4e4f58

function page(packets: Uint8Array[], granule: number, sequence: number, flags: number): Uint8Array {
  const segments = packets.flatMap((p) => lacing(p.length))
  const body = packets.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(27 + segments.length + body)
  const view = new DataView(out.buffer)
  out.set([0x4f, 0x67, 0x67, 0x53])
  view.setUint8(5, flags)
  view.setBigInt64(6, BigInt(granule), true)
  view.setUint32(14, SERIAL, true)
  view.setUint32(18, sequence, true)
  view.setUint8(26, segments.length)
  out.set(segments, 27)
  let at = 27 + segments.length
  for (const p of packets) {
    out.set(p, at)
    at += p.length
  }
  view.setUint32(22, oggCrc(out), true)
  return out
}

export function opusHead(preSkip: number, inputRate: number): Uint8Array {
  const head = new Uint8Array(19)
  const view = new DataView(head.buffer)
  head.set(new TextEncoder().encode('OpusHead'))
  view.setUint8(8, 1)
  view.setUint8(9, 1)
  view.setUint16(10, preSkip, true)
  view.setUint32(12, inputRate, true)
  return head
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('meridian')
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  tags.set(new TextEncoder().encode('OpusTags'))
  new DataView(tags.buffer).setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  return tags
}

export interface OpusPacket {
  data: Uint8Array
  // In microseconds, as WebCodecs reports it.
  duration: number
}

// `head` is the encoder's own OpusHead when it gives one (it knows its pre-skip); `samples` is the length of the input
// at `inputRate`, so the last page ends where the audio does and not at the end of the last frame.
export function oggOpus(head: Uint8Array, packets: OpusPacket[], samples: number, inputRate: number): Uint8Array<ArrayBuffer> {
  const preSkip = new DataView(head.buffer, head.byteOffset).getUint16(10, true)
  const pages = [page([head], 0, 0, 0x02), page([opusTags()], 0, 1, 0)]
  const end = preSkip + Math.round((samples * OPUS_RATE) / inputRate)
  let granule = preSkip
  let batch: Uint8Array[] = []
  let segments = 0
  const flush = (last: boolean): void => {
    pages.push(page(batch, last ? Math.min(granule, end) : granule, pages.length, last ? 0x04 : 0))
    batch = []
    segments = 0
  }
  packets.forEach((p, i) => {
    const needed = lacing(p.data.length).length
    if (segments + needed > MAX_SEGMENTS) flush(false)
    batch.push(p.data)
    segments += needed
    granule += Math.round((p.duration * OPUS_RATE) / 1_000_000)
    if (i === packets.length - 1) flush(true)
  })
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of pages) {
    out.set(p, at)
    at += p.length
  }
  return out
}
