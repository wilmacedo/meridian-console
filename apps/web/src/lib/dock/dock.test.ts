import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The orb's state registers itself on `window` in dev; these tests run without a DOM.
vi.stubGlobal('window', {})
const { dock, requestPin, resetDock } = await import('./dock.svelte')
const { prefs } = await import('../workspace/prefs.svelte')
const { services } = await import('./widgets')

beforeEach(() => {
  vi.useFakeTimers()
  resetDock()
  dock.pending = null
})
afterEach(() => {
  prefs.carplay = false
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

  it('does not pin the same system widget twice', () => {
    prefs.carplay = true
    requestPin(services())
    requestPin(services())
    expect(dock.rails.R).toHaveLength(1)
  })
})
