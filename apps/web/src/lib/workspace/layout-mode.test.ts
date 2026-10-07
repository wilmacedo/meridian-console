import { describe, expect, it } from 'vitest'
import { isStackedFor } from './layout-mode'

describe('isStackedFor', () => {
  it('follows the shape of the screen in auto', () => {
    expect(isStackedFor('auto', 1440, 2560)).toBe(true)
    expect(isStackedFor('auto', 2560, 1440)).toBe(false)
    expect(isStackedFor('auto', 1512, 982)).toBe(false)
    expect(isStackedFor('auto', 1000, 1100)).toBe(false)
  })

  it('is forced by the workspace', () => {
    expect(isStackedFor('stacked', 2560, 1440)).toBe(true)
    expect(isStackedFor('side', 1440, 2560)).toBe(false)
  })
})
