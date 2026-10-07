import { describe, expect, it } from 'vitest'
import { clampStrands, sanitizeModuleOrder } from './module-order'

describe('workspace prefs', () => {
  it('keeps a stored dock order and appends modules it does not know about', () => {
    expect(sanitizeModuleOrder(['cameras', 'core'])).toEqual(['cameras', 'core', 'services', 'telemetry', 'logs'])
  })

  it('drops unknown and repeated modules, and falls back to the default order', () => {
    expect(sanitizeModuleOrder(['core', 'core', 'nope', 'logs'])).toEqual(['core', 'logs', 'services', 'telemetry', 'cameras'])
    expect(sanitizeModuleOrder(undefined)).toEqual(['core', 'services', 'telemetry', 'logs', 'cameras'])
  })

  it('clamps the strand count to the slider range and its step', () => {
    expect(clampStrands(5)).toBe(16)
    expect(clampStrands(200)).toBe(80)
    expect(clampStrands(33)).toBe(32)
  })
})
