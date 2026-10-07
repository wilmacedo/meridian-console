export interface Size {
  w: number
  h: number
}

export interface Rect extends Size {
  x: number
  y: number
}

// A window's geometry as fractions of the stage, so it survives stage resizes.
export interface Frac {
  fx: number
  fy: number
  fw: number
  fh: number
}

export type ResizeMode = 'e' | 'w' | 's' | 'se' | 'sw'

export type GuideKind = 'edge' | 'centre' | 'gap'

export interface Guide {
  axis: 'x' | 'y'
  pos: number
  kind: GuideKind
}

export const MIN_W = 340
export const MIN_H = 230
export const GAP = 14
export const SNAP = 8
export const MAX_SINGLE_W = 940

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export function toFrac(r: Rect, stage: Size): Frac {
  return { fx: r.x / stage.w, fy: r.y / stage.h, fw: r.w / stage.w, fh: r.h / stage.h }
}

export function clampRect(r: Rect, stage: Size): Rect {
  const w = Math.min(stage.w, Math.max(Math.min(MIN_W, stage.w), r.w))
  const h = Math.min(stage.h, Math.max(Math.min(MIN_H, stage.h), r.h))
  return { x: clamp(r.x, 0, stage.w - w), y: clamp(r.y, 0, stage.h - h), w, h }
}

export function toRect(f: Frac, stage: Size): Rect {
  return clampRect({ x: f.fx * stage.w, y: f.fy * stage.h, w: f.fw * stage.w, h: f.fh * stage.h }, stage)
}

// Auto layout for 1-4 windows in open order; null when the stage is too small to tile them.
export function tile(n: number, stage: Size): Frac[] | null {
  const { w: W, h: H } = stage
  const rects: Rect[] = []
  const put = (x: number, y: number, w: number, h: number): void => void rects.push({ x, y, w, h })
  const cols = W >= 2 * MIN_W + GAP
  const rows = H >= 2 * MIN_H + GAP
  if (n === 0) return []
  if (n === 1) {
    const w = Math.min(MAX_SINGLE_W, W)
    put((W - w) / 2, 0, w, H)
  } else if (n === 2) {
    if (cols) {
      const w = (W - GAP) / 2
      put(0, 0, w, H)
      put(w + GAP, 0, w, H)
    } else if (rows) {
      const h = (H - GAP) / 2
      put(0, 0, W, h)
      put(0, h + GAP, W, h)
    } else return null
  } else {
    if (!cols || !rows) return null
    const w2 = (W - GAP) / 2
    const h2 = (H - GAP) / 2
    if (n === 3) {
      const lw = Math.max(MIN_W, (W - GAP) * 0.56)
      const rw = W - GAP - lw
      put(0, 0, lw, H)
      put(lw + GAP, 0, rw, h2)
      put(lw + GAP, h2 + GAP, rw, h2)
    } else {
      for (let i = 0; i < 4; i++) put((i % 2) * (w2 + GAP), Math.floor(i / 2) * (h2 + GAP), w2, h2)
    }
  }
  return rects.map((r) => toFrac(r, stage))
}

// Where the k-th window opens when the stage can't be tiled.
export function cascade(k: number, stage: Size): Frac {
  const { w: W, h: H } = stage
  const w = Math.min(W, Math.max(MIN_W, W * 0.6))
  const h = Math.min(H, Math.max(MIN_H, H * 0.78))
  const x = clamp((W - w) / 2 + (k % 4) * 28, 0, W - w)
  const y = clamp((k % 4) * 24, 0, H - h)
  return toFrac({ x, y, w, h }, stage)
}

interface Target {
  v: number
  kind: GuideKind
}

// Snap targets: the stage's edges and centre, plus every other window's edges, centres and 14px gaps.
function targets(stage: Size, others: Rect[]): { xs: Target[]; ys: Target[] } {
  const xs: Target[] = [{ v: 0, kind: 'edge' }, { v: stage.w / 2, kind: 'centre' }, { v: stage.w, kind: 'edge' }]
  const ys: Target[] = [{ v: 0, kind: 'edge' }, { v: stage.h / 2, kind: 'centre' }, { v: stage.h, kind: 'edge' }]
  for (const r of others) {
    xs.push({ v: r.x, kind: 'edge' }, { v: r.x + r.w / 2, kind: 'edge' }, { v: r.x + r.w, kind: 'edge' }, { v: r.x - GAP, kind: 'gap' }, { v: r.x + r.w + GAP, kind: 'gap' })
    ys.push({ v: r.y, kind: 'edge' }, { v: r.y + r.h / 2, kind: 'edge' }, { v: r.y + r.h, kind: 'edge' }, { v: r.y - GAP, kind: 'gap' }, { v: r.y + r.h + GAP, kind: 'gap' })
  }
  return { xs, ys }
}

// The smallest offset (within SNAP) that aligns one of `edges` with a target and passes `ok`.
function nearest(edges: number[], tg: Target[], ok?: (df: number) => boolean): { df: number; t: Target } | null {
  let best: { df: number; t: Target } | null = null
  for (const e of edges)
    for (const t of tg) {
      const df = t.v - e
      if (Math.abs(df) <= SNAP && (!ok || ok(df)) && (!best || Math.abs(df) < Math.abs(best.df))) best = { df, t }
    }
  return best
}

// Every target an edge coincides with after snapping gets a guide, not only the one snapped to.
function guidesFor(axis: 'x' | 'y', edges: number[], tg: Target[], snapped: Target[]): Guide[] {
  const out: Guide[] = []
  const add = (t: Target): void => {
    if (!out.some((g) => g.pos === t.v && g.kind === t.kind)) out.push({ axis, pos: t.v, kind: t.kind })
  }
  snapped.forEach(add)
  for (const e of edges) for (const t of tg) if (Math.abs(t.v - e) < 0.5) add(t)
  return out
}

export interface SnapResult {
  rect: Rect
  guides: Guide[]
}

export function snapMove(start: Rect, dx: number, dy: number, stage: Size, others: Rect[]): SnapResult {
  const { xs, ys } = targets(stage, others)
  const { w, h } = start
  let x = clamp(start.x + dx, 0, stage.w - w)
  let y = clamp(start.y + dy, 0, stage.h - h)
  const sx: Target[] = []
  const sy: Target[] = []
  const bx = nearest([x, x + w / 2, x + w], xs, (df) => x + df >= 0 && x + df + w <= stage.w)
  if (bx) {
    x += bx.df
    sx.push(bx.t)
  }
  const by = nearest([y, y + h / 2, y + h], ys, (df) => y + df >= 0 && y + df + h <= stage.h)
  if (by) {
    y += by.df
    sy.push(by.t)
  }
  return {
    rect: { x, y, w, h },
    guides: [...guidesFor('x', [x, x + w / 2, x + w], xs, sx), ...guidesFor('y', [y, y + h / 2, y + h], ys, sy)],
  }
}

export function snapResize(start: Rect, mode: ResizeMode, dx: number, dy: number, stage: Size, others: Rect[]): SnapResult {
  const { xs, ys } = targets(stage, others)
  const mw = Math.min(MIN_W, stage.w)
  const mh = Math.min(MIN_H, stage.h)
  const right0 = start.x + start.w
  const bottom0 = start.y + start.h
  let { x, y, w, h } = start
  const sx: Target[] = []
  const sy: Target[] = []

  if (mode === 'e' || mode === 'se') {
    let r = clamp(right0 + dx, start.x + mw, stage.w)
    const b = nearest([r], xs, (df) => r + df >= start.x + mw && r + df <= stage.w)
    if (b) {
      r += b.df
      sx.push(b.t)
    }
    w = r - start.x
  }
  if (mode === 'w' || mode === 'sw') {
    let l = clamp(start.x + dx, 0, right0 - mw)
    const b = nearest([l], xs, (df) => l + df >= 0 && l + df <= right0 - mw)
    if (b) {
      l += b.df
      sx.push(b.t)
    }
    x = l
    w = right0 - l
  }
  if (mode === 's' || mode === 'se' || mode === 'sw') {
    let bt = clamp(bottom0 + dy, start.y + mh, stage.h)
    const b = nearest([bt], ys, (df) => bt + df >= start.y + mh && bt + df <= stage.h)
    if (b) {
      bt += b.df
      sy.push(b.t)
    }
    h = bt - start.y
  }
  return {
    rect: { x, y, w, h },
    guides: [...sx.map((t): Guide => ({ axis: 'x', pos: t.v, kind: t.kind })), ...sy.map((t): Guide => ({ axis: 'y', pos: t.v, kind: t.kind }))],
  }
}
