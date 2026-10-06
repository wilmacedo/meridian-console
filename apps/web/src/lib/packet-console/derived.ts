import { splitFields } from './scanner'
import { humanDecode } from './chat'
import type { LogEntry } from './console-state.svelte'

export function filterFeed(feed: LogEntry[], lvlOff: Record<string, boolean>, chanOff: Record<string, boolean>, query: string): LogEntry[] {
  const q = query.trim().toLowerCase()
  return feed.filter((l) => !lvlOff[l.lvl] && !chanOff[l.chan] && (!q || humanDecode(l.raw).toLowerCase().includes(q)))
}

const emptyEntry: LogEntry = { id: 0, lvl: 'PKT', dir: 'IN', chan: 'zm', raw: '', t: '--', epochMs: 0 }

export function findSelected(feed: LogEntry[], shown: LogEntry[], packetSel: number): LogEntry {
  return feed.find((l) => l.id === packetSel) ?? shown[shown.length - 1] ?? emptyEntry
}

export interface Field {
  label: string
  value: string
}

// `%xt%zm%getDrop%1%Blade%20of%20Awe%1%` yields one "arg 2" field, spaces intact — see
// splitFields for the escape-aware split this relies on.
export function buildFields(raw: string): Field[] {
  return splitFields(raw).map((value, i) => ({
    label: i === 0 ? 'proto' : i === 1 ? 'scope' : i === 2 ? 'cmd' : `arg ${i - 2}`,
    value,
  }))
}
