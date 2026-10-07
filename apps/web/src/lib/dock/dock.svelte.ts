import { kick } from '../agent/agent-state.svelte'
import { railSides } from './stage-insets'
import { tele, type RailId, type WidgetDef } from './widgets'

export interface Widget {
  id: string
  def: WidgetDef
  collapsed: boolean
  closing: boolean
  // Just dropped by the user: plays the landing animation instead of the entrance.
  landed: boolean
  // Height and slide direction captured when closing starts, for the exit animation.
  exitHeight: number
  exitDx: number
}

const CLOSE_MS = 560
const CLOSE_SLIDE_PX = 24
const CLEAR_STAGGER_MS = 90
const FLASH_MS = 2300
const PENDING_EXIT_MS = 260

export interface DragState {
  // A widget id, or PENDING_ID for the card of a pin being placed.
  id: string
  // Ghost position (top-left, viewport px) and size.
  x: number
  y: number
  w: number
  h: number
  // Where inside the ghost it was grabbed.
  ox: number
  oy: number
  // Target rail and slot index; null when the pointer is nowhere near a rail (pending pins only).
  rail: RailId | null
  index: number
  rot: number
  landing: boolean
}

export const PENDING_ID = '__pending'

const defaultRails = (): Record<RailId, string[]> => ({ L: ['w1'], R: [] })
const defaultWidgets = (): Record<string, Widget> => ({
  w1: { id: 'w1', def: tele(), collapsed: false, closing: false, landed: false, exitHeight: 0, exitDx: 0 },
})

export const dock = $state({
  rails: defaultRails(),
  widgets: defaultWidgets(),
  flash: null as string | null,
  flashCount: 0,
  // A pin waiting to be dropped on a rail.
  pending: null as WidgetDef | null,
  pendingLeaving: false,
  drag: null as DragState | null,
})

let nextId = 1
const railEls: Partial<Record<RailId, HTMLElement>> = {}

export const setRailEl = (rail: RailId, el: HTMLElement | undefined): void => void (railEls[rail] = el)
export const railEl = (rail: RailId): HTMLElement | undefined => railEls[rail]

export const railOf = (id: string): RailId => (dock.rails.L.includes(id) ? 'L' : 'R')
// Which sides of the stage make room for a rail (see railSides).
export const stageSides = (): Record<RailId, boolean> => railSides(dock.rails, dock.drag !== null || dock.pending !== null)

// A system widget is unique per type and service; asking for one that exists must not duplicate it.
export function findSystemWidget(def: WidgetDef): string | undefined {
  if (def.src !== 'sys') return undefined
  return Object.keys(dock.widgets).find((id) => dock.widgets[id].def.type === def.type && (dock.widgets[id].def.svc ?? '') === (def.svc ?? ''))
}

export function flashWidget(id: string): void {
  dock.flash = id
  dock.flashCount++
  setTimeout(() => {
    if (dock.flash === id) dock.flash = null
  }, FLASH_MS)
}

export function scrollToWidget(id: string): void {
  const list = railEls[railOf(id)]
  const node = list?.querySelector<HTMLElement>(`[data-wid="${id}"]`)
  if (list && node) list.scrollTo({ top: node.offsetTop - 8, behavior: 'smooth' })
}

export function insertWidget(def: WidgetDef, rail: RailId, index: number): string {
  const id = `w${++nextId}`
  dock.widgets[id] = { id, def, collapsed: false, closing: false, landed: true, exitHeight: 0, exitDx: 0 }
  dock.rails[rail].splice(Math.min(index, dock.rails[rail].length), 0, id)
  flashWidget(id)
  kick(0.6)
  return id
}

export function moveWidget(id: string, rail: RailId, index: number): void {
  dock.rails.L = dock.rails.L.filter((x) => x !== id)
  dock.rails.R = dock.rails.R.filter((x) => x !== id)
  dock.rails[rail].splice(Math.min(index, dock.rails[rail].length), 0, id)
  dock.widgets[id].landed = true
  flashWidget(id)
}

export function requestPin(def: WidgetDef): void {
  const existing = findSystemWidget(def)
  if (existing) {
    scrollToWidget(existing)
    flashWidget(existing)
  } else {
    dock.pending = def
  }
}

export function cancelPending(): boolean {
  if (!dock.pending || dock.pendingLeaving || dock.drag) return false
  dock.pendingLeaving = true
  setTimeout(() => {
    dock.pending = null
    dock.pendingLeaving = false
  }, PENDING_EXIT_MS)
  return true
}

export function dropPending(rail: RailId, index: number): void {
  if (!dock.pending) return
  insertWidget(dock.pending, rail, index)
  dock.pending = null
}

export const pinLabel = (def: WidgetDef | null): string => (dock.pending ? 'PINNING…' : def && findSystemWidget(def) ? 'DOCKED' : 'PIN TO DOCK')

export function toggleCollapsed(id: string): void {
  dock.widgets[id].collapsed = !dock.widgets[id].collapsed
}

export function closeWidget(id: string, delay = 0): void {
  const w = dock.widgets[id]
  if (!w || w.closing) return
  const node = railEls[railOf(id)]?.querySelector<HTMLElement>(`[data-wid="${id}"]`)
  const height = node?.offsetHeight ?? 120
  const dx = railOf(id) === 'L' ? -CLOSE_SLIDE_PX : CLOSE_SLIDE_PX
  setTimeout(() => {
    if (!dock.widgets[id]) return
    Object.assign(dock.widgets[id], { closing: true, exitHeight: height, exitDx: dx })
    setTimeout(() => removeWidget(id), CLOSE_MS)
  }, delay)
}

function removeWidget(id: string): void {
  delete dock.widgets[id]
  dock.rails.L = dock.rails.L.filter((x) => x !== id)
  dock.rails.R = dock.rails.R.filter((x) => x !== id)
}

// Closes every widget NOX made; system widgets stay docked.
export function clearAgentWidgets(): number {
  const ids = Object.keys(dock.widgets).filter((id) => dock.widgets[id].def.src === 'agent')
  ids.forEach((id, i) => closeWidget(id, i * CLEAR_STAGGER_MS))
  return ids.length
}

export interface PersistedWidget {
  def: WidgetDef
  collapsed: boolean
}

export const snapshotDock = (): { rails: Record<RailId, string[]>; widgets: Record<string, PersistedWidget> } => {
  const rails = {
    L: dock.rails.L.filter((id) => !dock.widgets[id]?.closing),
    R: dock.rails.R.filter((id) => !dock.widgets[id]?.closing),
  }
  const widgets: Record<string, PersistedWidget> = {}
  for (const id of [...rails.L, ...rails.R]) widgets[id] = { def: $state.snapshot(dock.widgets[id].def) as WidgetDef, collapsed: dock.widgets[id].collapsed }
  return { rails, widgets }
}

// What a workspace that has never been arranged starts with.
export function resetDock(): void {
  dock.rails = defaultRails()
  dock.widgets = defaultWidgets()
  nextId = 1
}

export function restoreDock(rails: Record<RailId, string[]>, widgets: Record<string, PersistedWidget>): void {
  dock.widgets = Object.fromEntries(Object.entries(widgets).map(([id, w]) => [id, { id, def: w.def, collapsed: w.collapsed, closing: false, landed: false, exitHeight: 0, exitDx: 0 }]))
  dock.rails = { L: rails.L.filter((id) => widgets[id]), R: rails.R.filter((id) => widgets[id]) }
  nextId = Math.max(1, ...Object.keys(widgets).map((id) => Number(id.slice(1)) || 0))
}
