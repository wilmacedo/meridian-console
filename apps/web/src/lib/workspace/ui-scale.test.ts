import { describe, expect, it } from 'vitest'
import { sanitizeScale, uiScaleFor } from './ui-scale'

describe('uiScaleFor', () => {
  it('leaves an ordinary workspace alone', () => {
    expect(uiScaleFor('auto', false, 1280)).toBe(1)
  })

  it('enlarges the car layout until the page is about 800 px wide', () => {
    expect(uiScaleFor('auto', true, 1280)).toBeCloseTo(1.6)
    expect(uiScaleFor('auto', true, 1920)).toBeCloseTo(2.4)
  })

  it('shrinks the layout of a window that is narrow in CSS pixels, so it lays out as about 800 wide', () => {
    expect(uiScaleFor('auto', true, 413)).toBeCloseTo(0.5, 1)
    expect(uiScaleFor('auto', true, 844)).toBeCloseTo(1.05)
    expect(uiScaleFor('auto', true, 600)).toBeCloseTo(0.75)
  })

  it('does not shrink below 0.4', () => {
    expect(uiScaleFor('auto', true, 200)).toBe(0.4)
  })

  it('stops enlarging at 2.5', () => {
    expect(uiScaleFor('auto', true, 5000)).toBe(2.5)
  })

  it('uses what the owner picked, in any workspace', () => {
    expect(uiScaleFor(1.5, false, 1280)).toBe(1.5)
    expect(uiScaleFor(1, true, 1280)).toBe(1)
  })
})

describe('sanitizeScale', () => {
  it('keeps a number inside the range and falls back to auto for anything else', () => {
    expect(sanitizeScale(1.5)).toBe(1.5)
    expect(sanitizeScale(9)).toBe(2.5)
    expect(sanitizeScale(0.2)).toBe(0.4)
    expect(sanitizeScale(0.75)).toBe(0.75)
    expect(sanitizeScale('big')).toBe('auto')
    expect(sanitizeScale(undefined)).toBe('auto')
    expect(sanitizeScale(Number.NaN)).toBe('auto')
  })
})
