// Cuts NOX's streaming text into sentences, so speech can start before the answer is finished.
//
// A sentence ends at . ! ? … or a line break that is followed by whitespace (so "2.4.1" and "3,5" stay
// whole). Very short pieces are merged into the next one: the voice sounds worse on a lone "Ok." and each
// request costs latency.
const MIN_CHARS = 24
const MAX_CHARS = 220

const END = /[.!?…]+(?=\s)|\n+/g

export class SentenceSplitter {
  private buffer = ''

  // Feeds a piece of text; returns the sentences that are complete now.
  push(delta: string): string[] {
    this.buffer += delta
    const out: string[] = []
    let start = 0
    let pending = ''
    for (const m of this.buffer.matchAll(END)) {
      const end = (m.index ?? 0) + m[0].length
      pending += this.buffer.slice(start, end)
      start = end
      if (pending.trim().length >= MIN_CHARS) {
        out.push(pending.trim())
        pending = ''
      }
    }
    // Keep what has not formed a sentence yet; a piece that is too short waits for the next one.
    this.buffer = pending + this.buffer.slice(start)
    // A very long run without a stop is spoken at its last comma or space.
    while (this.buffer.length > MAX_CHARS) {
      const cut = Math.max(this.buffer.lastIndexOf(', ', MAX_CHARS), this.buffer.lastIndexOf(' ', MAX_CHARS))
      const at = cut > MIN_CHARS ? cut + 1 : MAX_CHARS
      out.push(this.buffer.slice(0, at).trim())
      this.buffer = this.buffer.slice(at)
    }
    return out
  }

  // The rest, once the answer is over.
  flush(): string | undefined {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest || undefined
  }
}
