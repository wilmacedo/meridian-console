import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TUNING } from './speech-detector'
import { isCarMode, noiseLevel, tailMs, tuning, warmupWanted } from './car-mode'

const at = (search: string): void => void vi.stubGlobal('location', { search })

afterEach(() => vi.unstubAllGlobals())

describe('car mode', () => {
  it('is on only for the carplay workspace', () => {
    at('?workspace=carplay')
    expect(isCarMode()).toBe(true)
    expect(warmupWanted()).toBe(true)
    at('?workspace=casa')
    expect(isCarMode()).toBe(false)
    expect(warmupWanted()).toBe(false)
    at('')
    expect(isCarMode()).toBe(false)
  })

  it('leaves every other workspace on the plain detector', () => {
    at('?workspace=casa&noise=strict')
    expect(noiseLevel()).toBe('off')
    expect(tuning()).toBe(DEFAULT_TUNING)
  })

  it('starts the car at normal and can be moved either way from the address', () => {
    at('?workspace=carplay')
    expect(noiseLevel()).toBe('normal')
    at('?workspace=carplay&noise=strict')
    expect(noiseLevel()).toBe('strict')
    expect(tuning().minVoicedMs).toBeGreaterThan(250)
    at('?workspace=carplay&noise=off')
    expect(tuning()).toBe(DEFAULT_TUNING)
  })

  it('adds the output latency to the tail', () => {
    at('?workspace=carplay')
    expect(tailMs(0.2)).toBe(700)
    at('?workspace=carplay&tail=1000')
    expect(tailMs(0)).toBe(1000)
  })
})
