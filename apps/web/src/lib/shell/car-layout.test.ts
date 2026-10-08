import { describe, expect, it } from 'vitest'
import { carLayout } from './car-layout'

describe('carLayout', () => {
  it('fits a phone turned sideways', () => {
    const l = carLayout(844, 390, 4)
    expect(l).toMatchObject({ bar: 64, cols: 1, rows: 4, rowMin: 84, colW: 304 })
    expect(l.zoneW).toBe(516)
    expect(l.zoneH).toBe(302)
    expect(l.radius).toBeCloseTo(75.5)
  })

  it('fits a laptop screen', () => {
    const l = carLayout(1280, 720, 4)
    expect(l).toMatchObject({ bar: 76, cols: 1, rowMin: 100, colW: 380 })
    expect(l.radius).toBeCloseTo(155)
    expect(l.ox).toBe(438)
  })

  it('uses two columns on a very wide screen with many tiles', () => {
    const l = carLayout(2560, 1080, 4)
    expect(l).toMatchObject({ cols: 2, rows: 2, colW: 680 })
    expect(carLayout(2560, 1080, 3).cols).toBe(1)
    expect(carLayout(1000, 400, 6).cols).toBe(1)
  })

  it('gives the core the whole width when there are no tiles', () => {
    const l = carLayout(1280, 720, 0)
    expect(l).toMatchObject({ colW: 0, zoneW: 1280, rows: 1 })
  })

  it('never lets the core get smaller than a thumb', () => {
    expect(carLayout(320, 200, 4).radius).toBe(56)
  })

  it('keeps the label inside the screen and the hint under the core', () => {
    const l = carLayout(844, 390, 4)
    expect(l.labelTop).toBeGreaterThanOrEqual(14)
    expect(l.hintTop).toBeGreaterThan(l.oy + l.radius)
  })
})
