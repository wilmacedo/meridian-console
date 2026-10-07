import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SINGLE_W } from './window-layout'

// The orb's state registers itself on `window` in dev; these tests run without a DOM.
vi.stubGlobal('window', {})
const { open, rectFor, setStage, wm } = await import('./window-manager.svelte')

const widthOf = (id: 'services' | 'logs'): number => rectFor(wm.wins.find((w) => w.id === id)!).w

beforeEach(() => {
  vi.useFakeTimers()
  wm.wins = []
  wm.custom = false
  wm.stage = { w: 0, h: 0 }
  setStage({ w: 900, h: 600 })
  vi.advanceTimersByTime(200)
})
afterEach(() => vi.useRealTimers())

describe('stage changes', () => {
  it('re-tiles a tiled layout once the stage settles, not on every step', () => {
    open('services')
    open('logs')
    expect(Math.round(widthOf('services'))).toBe(Math.round((900 - 14) / 2))

    setStage({ w: 1000, h: 600 })
    setStage({ w: 1100, h: 600 })
    expect(widthOf('services')).toBeCloseTo(((900 - 14) / 2 / 900) * 1100, 0)
    vi.advanceTimersByTime(200)
    expect(Math.round(widthOf('services'))).toBe(Math.round((1100 - 14) / 2))
  })

  it('caps a single window at its tiled width when the stage grows', () => {
    open('services')
    setStage({ w: MAX_SINGLE_W + 600, h: 600 })
    vi.advanceTimersByTime(200)
    expect(Math.round(widthOf('services'))).toBe(MAX_SINGLE_W)
  })

  it('leaves windows the owner placed alone', () => {
    open('services')
    open('logs')
    wm.custom = true
    const before = { ...wm.wins[0].frac }
    setStage({ w: 1400, h: 600 })
    vi.advanceTimersByTime(200)
    expect(wm.wins[0].frac).toEqual(before)
  })
})
