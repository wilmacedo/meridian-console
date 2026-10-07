import { dock, dropPending, moveWidget, PENDING_ID, railEl } from './dock.svelte'
import type { RailId } from './widgets'

const DRAG_THRESHOLD_PX = 5
const PENDING_RAIL_RANGE_PX = 140
const AUTOSCROLL_EDGE_PX = 40
const AUTOSCROLL_STEP_PX = 14
const MAX_TILT_DEG = 7
const TILT_RESET_MS = 90
const LAND_MS = 320

export const DRAG_START_THRESHOLD = DRAG_THRESHOLD_PX

interface Press {
  id: string
  pending: boolean
  // The element being dragged (cloned into the ghost) and where it sat.
  card: HTMLElement
  origin: DOMRect
  ox: number
  oy: number
  lastX: number
  rot: number
}

let press: Press | null = null
let tiltTimer: ReturnType<typeof setTimeout> | undefined
// The ghost shows a snapshot of the dragged card.
export let ghostClone: HTMLElement | null = null

function begin(e: PointerEvent, id: string, pending: boolean, card: HTMLElement): void {
  const origin = card.getBoundingClientRect()
  press = { id, pending, card, origin, ox: e.clientX - origin.left, oy: e.clientY - origin.top, lastX: e.clientX, rot: 0 }
}

export function pressWidget(e: PointerEvent, id: string): void {
  const item = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-wid]')
  const card = item?.firstElementChild as HTMLElement | null
  if (card && !dock.drag) begin(e, id, false, card)
}

export function pressPending(e: PointerEvent): void {
  if (!dock.drag) begin(e, PENDING_ID, true, e.currentTarget as HTMLElement)
}

const distanceTo = (rail: RailId, x: number): number => {
  const el = railEl(rail)
  if (!el) return Infinity
  const b = el.getBoundingClientRect()
  if (!b.width) return Infinity
  return x < b.left ? b.left - x : x > b.right ? x - b.right : 0
}

// Number of widgets whose midpoint is above the pointer, ignoring the room the slot itself takes.
function slotIndex(el: HTMLElement, y: number): number {
  const rr = el.getBoundingClientRect()
  if (y < rr.top + AUTOSCROLL_EDGE_PX) el.scrollTop -= AUTOSCROLL_STEP_PX
  else if (y > rr.bottom - AUTOSCROLL_EDGE_PX) el.scrollTop += AUTOSCROLL_STEP_PX
  const slot = el.querySelector<HTMLElement>('[data-slot]')
  const slotTop = slot ? slot.offsetTop : Infinity
  const slotSpace = slot ? slot.offsetHeight + 10 : 0
  const base = rr.top - el.scrollTop
  let index = 0
  el.querySelectorAll<HTMLElement>('[data-wid]').forEach((n) => {
    if (n.dataset.wid === press?.id) return
    const top = n.offsetTop - (n.offsetTop > slotTop ? slotSpace : 0)
    if (y > base + top + n.offsetHeight / 2) index++
  })
  return index
}

export function dragMove(_dx: number, _dy: number, e: PointerEvent): void {
  const p = press
  if (!p || dock.drag?.landing) return
  if (!dock.drag) {
    ghostClone = p.card.cloneNode(true) as HTMLElement
    ghostClone.removeAttribute('data-pending')
    Object.assign(ghostClone.style, { animation: 'none', width: '100%', margin: '0', boxShadow: 'none' })
  }
  p.rot = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, p.rot * 0.6 + (e.clientX - p.lastX) * 0.35))
  p.lastX = e.clientX
  clearTimeout(tiltTimer)
  tiltTimer = setTimeout(() => {
    p.rot = 0
    if (dock.drag && !dock.drag.landing) dock.drag.rot = 0
  }, TILT_RESET_MS)

  const dL = distanceTo('L', e.clientX)
  const dR = distanceTo('R', e.clientX)
  const nearest: RailId = dL <= dR ? 'L' : 'R'
  const rail = p.pending && Math.min(dL, dR) >= PENDING_RAIL_RANGE_PX ? null : nearest
  const el = rail ? railEl(rail) : undefined
  dock.drag = {
    id: p.id,
    x: e.clientX - p.ox,
    y: e.clientY - p.oy,
    w: p.origin.width,
    h: p.origin.height,
    ox: p.ox,
    oy: p.oy,
    rail,
    index: el ? slotIndex(el, e.clientY) : 0,
    rot: p.rot,
    landing: false,
  }
}

export function dragEnd(moved: boolean, cancelled: boolean): void {
  const p = press
  const d = dock.drag
  clearTimeout(tiltTimer)
  if (!p || !moved || !d) {
    press = null
    return
  }
  // A cancelled gesture drops nowhere: the ghost flies back to where it started.
  const rail = cancelled ? null : d.rail
  const slot = rail ? railEl(rail)?.querySelector<HTMLElement>('[data-slot]') : null
  const target = slot ? slot.getBoundingClientRect() : p.origin
  Object.assign(d, { x: target.left, y: target.top, rot: 0, landing: true })
  setTimeout(() => {
    if (slot && rail) {
      if (p.pending) dropPending(rail, d.index)
      else moveWidget(p.id, rail, d.index)
    }
    dock.drag = null
    ghostClone = null
    press = null
  }, LAND_MS)
}
