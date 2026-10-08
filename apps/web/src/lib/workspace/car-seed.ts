import type { PersistedWidget } from '../dock/dock.svelte'
import { services, tele, type RailId, type WidgetDef } from '../dock/widgets'

// What a workspace in CarPlay mode starts with (design v12): the tiles it is made for, a dark theme and a lighter core.
export const CAR_STRANDS = 24

// A workspace nobody has arranged: nothing docked, or just the one telemetry widget a new workspace comes with.
export function isDefaultDock(rails: Record<RailId, readonly string[]>, widgets: Record<string, PersistedWidget>): boolean {
  const ids = [...rails.L, ...rails.R]
  return ids.length === 0 || (ids.length === 1 && widgets[ids[0]]?.def.type === 'tele')
}

export interface OwnWidget {
  type: string
  title: string
  kicker: string
}

// The widgets services offer as tiles go on the left rail and the built-in ones on the right, so they read left to
// right, top to bottom, in that order. The core never names a service: whatever declares a tile is what is shown.
export function carSeed(own: readonly OwnWidget[]): { rails: Record<RailId, string[]>; widgets: Record<string, PersistedWidget> } {
  const defs: { rail: RailId; def: WidgetDef }[] = [
    ...own.map((w) => ({ rail: 'L' as const, def: { type: w.type, src: 'sys' as const, title: w.title, kicker: w.kicker } })),
    { rail: 'R', def: services() },
    { rail: 'R', def: tele() },
  ]
  const rails: Record<RailId, string[]> = { L: [], R: [] }
  const widgets: Record<string, PersistedWidget> = {}
  defs.forEach(({ rail, def }, i) => {
    const id = `w${i + 1}`
    rails[rail].push(id)
    widgets[id] = { def, collapsed: false }
  })
  return { rails, widgets }
}
