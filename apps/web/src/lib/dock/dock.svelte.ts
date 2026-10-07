import { kick } from '../agent/agent-state.svelte'
import { feeder, tele, type RailId, type WidgetDef } from './widgets'

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

export const dock = $state({
  rails: { L: ['w1'], R: ['w2'] } as Record<RailId, string[]>,
  widgets: {
    w1: { id: 'w1', def: tele(), collapsed: false, closing: false, landed: false, exitHeight: 0, exitDx: 0 },
    w2: { id: 'w2', def: feeder(), collapsed: false, closing: false, landed: false, exitHeight: 0, exitDx: 0 },
  } as Record<string, Widget>,
  flash: null as string | null,
  flashCount: 0,
})

let nextId = 2
const railEls: Partial<Record<RailId, HTMLElement>> = {}

export const setRailEl = (rail: RailId, el: HTMLElement | undefined): void => void (railEls[rail] = el)
export const railEl = (rail: RailId): HTMLElement | undefined => railEls[rail]

export const railOf = (id: string): RailId => (dock.rails.L.includes(id) ? 'L' : 'R')
export const hasWidgets = (): boolean => dock.rails.L.length > 0 || dock.rails.R.length > 0

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
