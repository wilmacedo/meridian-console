import { decodeRaw, scan } from './scanner'
import type { LogEntry } from './console-state.svelte'

export function filterFeed(feed: LogEntry[], lvlOff: Record<string, boolean>, chanOff: Record<string, boolean>, query: string): LogEntry[] {
  const q = query.trim().toLowerCase()
  return feed.filter((l) => !lvlOff[l.lvl] && !chanOff[l.chan] && (!q || decodeRaw(l.raw).toLowerCase().includes(q)))
}

const emptyEntry: LogEntry = { id: 0, lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '', t: '--', epochMs: 0 }

export function findSelected(feed: LogEntry[], shown: LogEntry[], packetSel: number): LogEntry {
  return feed.find((l) => l.id === packetSel) ?? shown[shown.length - 1] ?? emptyEntry
}

export interface Field {
  label: string
  value: string
}

// The payload split only on `sep` tokens, with `esc` tokens always decoded inside each field —
// so `%xt%zm%getDrop%1%Blade%20of%20Awe%1%` yields one "arg 2" field, spaces intact.
export function buildFields(raw: string): Field[] {
  const args: string[] = []
  let current = ''
  for (const token of scan(raw)) {
    if (token.kind === 'sep') {
      if (current.length) args.push(current)
      current = ''
      continue
    }
    current += token.kind === 'esc' ? (token.dec === '␣' ? ' ' : (token.dec ?? '')) : token.text
  }
  if (current.length) args.push(current)

  return args.map((value, i) => ({
    label: i === 0 ? 'proto' : i === 1 ? 'scope' : i === 2 ? 'cmd' : `arg ${i - 2}`,
    value,
  }))
}
