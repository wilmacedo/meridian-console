import { describe, expect, it } from 'vitest'
import type { PersistedWidget } from '../dock/dock.svelte'
import { carSeed, isDefaultDock } from './car-seed'

const widget = (type: string): PersistedWidget => ({ def: { type, src: 'sys', title: type, kicker: '' }, collapsed: false })

describe('isDefaultDock', () => {
  it('is true for nothing docked and for the one telemetry widget of a new workspace', () => {
    expect(isDefaultDock({ L: [], R: [] }, {})).toBe(true)
    expect(isDefaultDock({ L: ['w1'], R: [] }, { w1: widget('tele') })).toBe(true)
  })

  it('is false once the owner docked something else', () => {
    expect(isDefaultDock({ L: ['w1'], R: [] }, { w1: widget('services') })).toBe(false)
    expect(isDefaultDock({ L: ['w1'], R: ['w2'] }, { w1: widget('tele'), w2: widget('tele') })).toBe(false)
  })
})

describe('carSeed', () => {
  const own = [
    { type: 'cal', title: 'Today', kicker: 'CALENDAR · LIVE' },
    { type: 'feeder', title: 'Feeder', kicker: 'AUTOMATION · LIVE' },
  ]

  it("puts the services' tiles on the left and the built-in ones on the right, in reading order", () => {
    const seed = carSeed(own)
    expect(seed.rails).toEqual({ L: ['w1', 'w2'], R: ['w3', 'w4'] })
    expect(['w1', 'w2', 'w3', 'w4'].map((id) => seed.widgets[id].def.type)).toEqual(['cal', 'feeder', 'services', 'tele'])
  })

  it('names no service itself: without any tile contributed it is just the built-in ones', () => {
    const seed = carSeed([])
    expect(seed.rails).toEqual({ L: [], R: ['w1', 'w2'] })
  })

  it('is a default dock no longer, so it is not seeded twice', () => {
    const seed = carSeed(own)
    expect(isDefaultDock(seed.rails, seed.widgets)).toBe(false)
  })
})
