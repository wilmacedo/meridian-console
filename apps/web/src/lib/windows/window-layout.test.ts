import { describe, expect, it } from 'vitest'
import { cascade, clampRect, GAP, MIN_H, MIN_W, snapMove, snapResize, tile, toFrac, toRect, type Rect, type Size } from './window-layout'

const stage: Size = { w: 1200, h: 600 }

describe('toRect / toFrac', () => {
  it('round-trips a rect that fits the stage', () => {
    const r: Rect = { x: 100, y: 50, w: 500, h: 300 }
    expect(toRect(toFrac(r, stage), stage)).toEqual(r)
  })

  it('keeps the same fractions on a bigger stage', () => {
    const f = toFrac({ x: 120, y: 60, w: 600, h: 300 }, stage)
    expect(toRect(f, { w: 2400, h: 1200 })).toEqual({ x: 240, y: 120, w: 1200, h: 600 })
  })
})

describe('clampRect', () => {
  it('enforces the minimum size and the stage bounds', () => {
    expect(clampRect({ x: -50, y: 900, w: 10, h: 10 }, stage)).toEqual({ x: 0, y: stage.h - MIN_H, w: MIN_W, h: MIN_H })
  })

  it('shrinks the minimum on a stage smaller than it', () => {
    expect(clampRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 200, h: 100 })).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })
})

describe('tile', () => {
  const rects = (n: number, s = stage): Rect[] => tile(n, s)!.map((f) => ({ x: f.fx * s.w, y: f.fy * s.h, w: f.fw * s.w, h: f.fh * s.h }))

  it('centres a single window at most 940px wide', () => {
    expect(rects(1)[0]).toEqual({ x: 130, y: 0, w: 940, h: 600 })
  })

  it('puts two windows side by side with a gap', () => {
    const [a, b] = rects(2)
    expect(a.w).toBeCloseTo((1200 - GAP) / 2)
    expect(b.x).toBeCloseTo(a.w + GAP)
    expect(a.h).toBe(600)
  })

  it('stacks two windows when the stage is too narrow for columns', () => {
    const [a, b] = rects(2, { w: 500, h: 600 })
    expect(a.w).toBe(500)
    expect(b.y).toBeCloseTo((600 - GAP) / 2 + GAP)
  })

  it('splits three windows into a left column and two stacked on the right', () => {
    const [a, b, c] = rects(3)
    expect(a.h).toBe(600)
    expect(a.w).toBeCloseTo((1200 - GAP) * 0.56)
    expect(b.x).toBeCloseTo(a.w + GAP)
    expect(c.y).toBeCloseTo(b.h + GAP)
  })

  it('makes a 2x2 grid of four', () => {
    const r = rects(4)
    expect(r[1].x).toBeCloseTo(r[0].w + GAP)
    expect(r[2].y).toBeCloseTo(r[0].h + GAP)
    expect(r[3].x).toBeCloseTo(r[1].x)
  })

  it('returns null when the stage cannot fit the set', () => {
    expect(tile(2, { w: 400, h: 400 })).toBeNull()
    expect(tile(3, { w: 1200, h: 400 })).toBeNull()
    expect(tile(4, { w: 600, h: 600 })).toBeNull()
  })
})

describe('cascade', () => {
  it('offsets successive windows and cycles every four', () => {
    const a = toRect(cascade(0, stage), stage)
    const b = toRect(cascade(1, stage), stage)
    expect(b.x - a.x).toBeCloseTo(28)
    expect(b.y - a.y).toBeCloseTo(24)
    expect(toRect(cascade(4, stage), stage)).toEqual(a)
  })
})

describe('snapMove', () => {
  const start: Rect = { x: 100, y: 100, w: 400, h: 300 }

  it('moves freely when nothing is within the snap distance', () => {
    const { rect, guides } = snapMove(start, 53, 41, stage, [])
    expect(rect).toEqual({ x: 153, y: 141, w: 400, h: 300 })
    expect(guides).toEqual([])
  })

  it('snaps to the stage edge and reports a guide', () => {
    const { rect, guides } = snapMove(start, -95, 0, stage, [])
    expect(rect.x).toBe(0)
    expect(guides).toContainEqual({ axis: 'x', pos: 0, kind: 'edge' })
  })

  it('snaps the window centre to the stage centre as a centre guide', () => {
    const { rect, guides } = snapMove(start, 305, 0, stage, [])
    expect(rect.x + rect.w / 2).toBe(600)
    expect(guides).toContainEqual({ axis: 'x', pos: 600, kind: 'centre' })
  })

  it('snaps to the 14px gap beside another window', () => {
    const other: Rect = { x: 700, y: 0, w: 300, h: 300 }
    const { rect, guides } = snapMove(start, 192, 0, stage, [other])
    expect(rect.x + rect.w).toBe(700 - GAP)
    expect(guides).toContainEqual({ axis: 'x', pos: 700 - GAP, kind: 'gap' })
  })

  it('never leaves the stage', () => {
    const { rect } = snapMove(start, 5000, 5000, stage, [])
    expect(rect.x + rect.w).toBe(stage.w)
    expect(rect.y + rect.h).toBe(stage.h)
  })
})

describe('snapResize', () => {
  const start: Rect = { x: 100, y: 100, w: 400, h: 300 }

  it('grows east and snaps the right edge to the stage edge', () => {
    const { rect, guides } = snapResize(start, 'e', 697, 0, stage, [])
    expect(rect.x + rect.w).toBe(stage.w)
    expect(guides).toContainEqual({ axis: 'x', pos: stage.w, kind: 'edge' })
  })

  it('keeps the right edge fixed when resizing west', () => {
    const { rect } = snapResize(start, 'w', 60, 0, stage, [])
    expect(rect.x + rect.w).toBe(500)
    expect(rect.x).toBe(160)
  })

  it('never shrinks below the minimum size', () => {
    const { rect } = snapResize(start, 'se', -1000, -1000, stage, [])
    expect(rect.w).toBe(MIN_W)
    expect(rect.h).toBe(MIN_H)
  })

  it('resizes both axes for a corner', () => {
    const { rect } = snapResize(start, 'sw', -40, 77, stage, [])
    expect(rect.x).toBe(60)
    expect(rect.w).toBe(440)
    expect(rect.h).toBe(377)
  })
})
