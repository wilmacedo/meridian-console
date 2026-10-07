import { kick } from '../agent/agent-state.svelte'
import type { ModuleId } from '../modules'
import { cascade, clampRect, snapMove, snapResize, tile, toFrac, toRect, type Frac, type Guide, type Rect, type ResizeMode, type Size } from './window-layout'

// A module's window (its module id), the generated doc, or a service's own window ("<service>:<id>").
export type WindowId = string

export interface WindowState {
  id: WindowId
  z: number
  frac: Frac
  closing: boolean
  // Fractions to restore on un-maximise.
  prev: Frac | null
}

const MAX_WINDOWS = 4
const CLOSE_MS = 470
const BULK_CLOSE_STAGGER_MS = 70
const KEY_STEP = 16

export const wm = $state({
  wins: [] as WindowState[],
  // Custom layout: entered on the first drag/resize/maximise; opens and closes stop re-tiling.
  custom: false,
  active: 'core' as WindowId | 'core',
  stage: { w: 0, h: 0 } as Size,
  guides: [] as Guide[],
  readout: '',
  // The window being dragged or resized, if any.
  gesture: null as WindowId | null,
})

let zTop = 10

const live = (): WindowState[] => wm.wins.filter((w) => !w.closing)
const find = (id: WindowId): WindowState | undefined => wm.wins.find((w) => w.id === id)
const rectOf = (w: WindowState): Rect => toRect(w.frac, wm.stage)

export const isOpen = (id: WindowId): boolean => live().some((w) => w.id === id)

export function setStage(size: Size): void {
  if (Math.abs(size.w - wm.stage.w) > 0.5 || Math.abs(size.h - wm.stage.h) > 0.5) wm.stage = size
}

export function rectFor(w: WindowState): Rect {
  return rectOf(w)
}

function applyTile(ids: WindowId[]): boolean {
  const fracs = tile(ids.length, wm.stage)
  if (!fracs) return false
  ids.forEach((id, i) => {
    const w = find(id)
    if (w) w.frac = fracs[i]
  })
  return true
}

export function open(id: WindowId): void {
  const current = live()
  if (current.some((w) => w.id === id)) return focus(id)
  kick(1)
  let ids = current.map((w) => w.id)
  if (current.length >= MAX_WINDOWS) {
    const oldest = current.reduce((a, b) => (a.z < b.z ? a : b))
    close(oldest.id)
    ids = ids.filter((x) => x !== oldest.id)
  }
  // Re-opening a window that is still playing its close animation replaces it.
  wm.wins = wm.wins.filter((w) => !(w.closing && w.id === id))
  const win: WindowState = { id, z: ++zTop, frac: { fx: 0, fy: 0, fw: 1, fh: 1 }, closing: false, prev: null }
  wm.wins.push(win)
  wm.active = id
  if (!wm.custom && applyTile([...ids, id])) return
  win.frac = cascade(ids.length, wm.stage)
  wm.custom = true
}

export function focus(id: WindowId): void {
  const w = find(id)
  if (!w || w.closing || (w.z === zTop && wm.active === id)) return
  w.z = ++zTop
  wm.active = id
}

export function close(id: WindowId): void {
  const w = find(id)
  if (!w || w.closing) return
  w.closing = true
  setTimeout(() => {
    wm.wins = wm.wins.filter((x) => !(x.id === id && x.closing))
    const rest = live()
    if (!rest.length) {
      kick(0.5)
      wm.active = 'core'
      wm.custom = false
      return
    }
    if (!wm.custom) applyTile(rest.map((x) => x.id))
    if (wm.active === id) wm.active = rest.reduce((a, b) => (a.z > b.z ? a : b)).id
  }, CLOSE_MS)
}

export function closeAll(): void {
  live().forEach((w, i) => setTimeout(() => close(w.id), i * BULK_CLOSE_STAGGER_MS))
}

export function closeActive(): void {
  if (wm.active !== 'core') close(wm.active)
}

export function arrange(): void {
  const ids = live().map((w) => w.id)
  if (!applyTile(ids)) return
  wm.custom = false
  for (const w of wm.wins) w.prev = null
}

export function toggleMaximise(id: WindowId): void {
  const w = find(id)
  if (!w || w.closing) return
  wm.custom = true
  if (w.prev) {
    w.frac = w.prev
    w.prev = null
    return
  }
  const r = rectOf(w)
  if (r.w >= wm.stage.w - 2 && r.h >= wm.stage.h - 2) return
  w.prev = w.frac
  w.frac = { fx: 0, fy: 0, fw: 1, fh: 1 }
  w.z = ++zTop
}

export type GestureMode = 'move' | ResizeMode

const READOUT_MOVE = (r: Rect): string => `X ${Math.round(r.x)}  Y ${Math.round(r.y)}`
const READOUT_SIZE = (r: Rect): string => `${Math.round(r.w)} × ${Math.round(r.h)}`

let start: { rect: Rect; others: Rect[] } | null = null

export function beginGesture(id: WindowId): void {
  const w = find(id)
  if (!w || w.closing) return
  start = { rect: rectOf(w), others: live().filter((o) => o.id !== id).map(rectOf) }
}

export function moveGesture(id: WindowId, mode: GestureMode, dx: number, dy: number): void {
  const w = find(id)
  if (!w || !start) return
  const { rect, guides } = mode === 'move' ? snapMove(start.rect, dx, dy, wm.stage, start.others) : snapResize(start.rect, mode, dx, dy, wm.stage, start.others)
  w.frac = toFrac(rect, wm.stage)
  w.prev = null
  wm.gesture = id
  wm.guides = guides
  wm.readout = mode === 'move' ? READOUT_MOVE(rect) : READOUT_SIZE(rect)
}

export function endGesture(moved: boolean): void {
  start = null
  wm.gesture = null
  wm.guides = []
  if (moved) wm.custom = true
}

// Keyboard equivalent of drag (arrows move) and resize (shift + arrows).
export function nudge(id: WindowId, dx: number, dy: number, resize: boolean): void {
  const w = find(id)
  if (!w || w.closing) return
  const r = rectOf(w)
  const next = resize ? clampRect({ ...r, w: r.w + dx * KEY_STEP, h: r.h + dy * KEY_STEP }, wm.stage) : clampRect({ ...r, x: r.x + dx * KEY_STEP, y: r.y + dy * KEY_STEP }, wm.stage)
  w.frac = toFrac(next, wm.stage)
  w.prev = null
  wm.custom = true
}

// What a dock button or a number key does: Core clears the stage, any other module opens its window.
export function openModule(id: ModuleId): void {
  if (id === 'core') closeAll()
  else open(id)
}

export interface PersistedWindow {
  id: WindowId
  z: number
  frac: Frac
  prev: Frac | null
}

// Puts back a saved layout; the windows play their open animation as they appear.
export function restoreWindows(list: PersistedWindow[], custom: boolean, active: string): void {
  wm.wins = list.map((w) => ({ ...w, closing: false }))
  wm.custom = custom
  wm.active = wm.wins.some((w) => w.id === active) ? active : (wm.wins.at(-1)?.id ?? 'core')
  zTop = Math.max(10, ...list.map((w) => w.z))
}

export const snapshotWindows = (): { list: PersistedWindow[]; custom: boolean; active: string } => ({
  list: live().map(({ id, z, frac, prev }) => ({ id, z, frac: { ...frac }, prev: prev && { ...prev } })),
  custom: wm.custom,
  active: wm.active,
})
