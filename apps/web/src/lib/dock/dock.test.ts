import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The orb's state registers itself on `window` in dev; these tests run without a DOM, but for the size of a screen that the layout reads.
vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800, addEventListener: () => {} })
const { dock, requestPin, resetDock } = await import('./dock.svelte')
const { prefs } = await import('../workspace/prefs.svelte')
const { services } = await import('./widgets')
const { layout } = await import('../workspace/layout.svelte')
const { shellUi } = await import('../shell/shell-ui.svelte')

beforeEach(() => {
  vi.useFakeTimers()
  resetDock()
  dock.pending = null
})
afterEach(() => {
  prefs.carplay = false
  layout.w = 1280
  shellUi.sheetOpen = false
  vi.useRealTimers()
})

describe('requestPin', () => {
  it('offers a card to drop on a rail outside the car', () => {
    requestPin(services())
    expect(dock.pending?.type).toBe('services')
    expect(dock.rails.R).toEqual([])
  })

  it('makes a tile of it at once in the car, as the last one', () => {
    prefs.carplay = true
    requestPin(services())
    expect(dock.pending).toBeNull()
    expect(dock.rails.R).toHaveLength(1)
    expect(dock.widgets[dock.rails.R[0]].def.type).toBe('services')
  })

  it('makes a widget of it at once on a phone, where there is no rail to drop on', () => {
    layout.w = 390
    requestPin(services())
    expect(dock.pending).toBeNull()
    expect(dock.rails.R).toHaveLength(1)
  })

  it('shows the widget that is already pinned on a phone', () => {
    layout.w = 390
    requestPin(services())
    requestPin(services())
    expect(dock.rails.R).toHaveLength(1)
    expect(shellUi.sheetOpen).toBe(true)
  })

  it('does not pin the same system widget twice', () => {
    prefs.carplay = true
    requestPin(services())
    requestPin(services())
    expect(dock.rails.R).toHaveLength(1)
  })
})
