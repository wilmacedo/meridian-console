import { escapeTable, knownCommands } from './constants'

export type TokenKind = 'esc' | 'sep' | 'proto' | 'cmd' | 'num' | 'word'

export interface Token {
  kind: TokenKind
  text: string
  dec?: string
}

// Left-to-right scan, never `split("%")` — that tears `%20` apart. See
// docs/design-handoff.md#screen-4--service-panel-packet-console-kind--packet-ie-aqw-idle.
export function scan(raw: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < raw.length) {
    const three = raw.slice(i, i + 3).toUpperCase()
    if (escapeTable[three]) {
      out.push({ kind: 'esc', text: three, dec: escapeTable[three] })
      i += 3
      continue
    }
    if (raw[i] === '%') {
      out.push({ kind: 'sep', text: '%' })
      i += 1
      continue
    }
    let j = i
    while (j < raw.length && raw[j] !== '%') j++
    const text = raw.slice(i, j)
    let kind: TokenKind = 'word'
    if (text === 'xt') kind = 'proto'
    else if (knownCommands.includes(text)) kind = 'cmd'
    else if (/^-?\d+$/.test(text)) kind = 'num'
    out.push({ kind, text })
    i = j
  }
  return out
}

export function decodeRaw(raw: string): string {
  return scan(raw)
    .map((t) => (t.kind === 'esc' ? (t.dec === '␣' ? ' ' : (t.dec ?? '')) : t.text))
    .join('')
}
