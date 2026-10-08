import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WakeArbiter, WAKE_WINDOW_MS } from './wake-arbiter.js'

describe('WakeArbiter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('lets only the screen that heard the word best answer', () => {
    const arbiter = new WakeArbiter()
    const verdicts: Record<string, boolean> = {}
    arbiter.claim(0.7, (g) => (verdicts.kitchen = g))
    arbiter.claim(0.9, (g) => (verdicts.office = g))
    expect(verdicts).toEqual({})
    vi.advanceTimersByTime(WAKE_WINDOW_MS)
    expect(verdicts).toEqual({ kitchen: false, office: true })
  })

  it('treats a claim after the window as a new wake-up', () => {
    const arbiter = new WakeArbiter()
    const verdicts: boolean[] = []
    arbiter.claim(0.9, (g) => verdicts.push(g))
    vi.advanceTimersByTime(WAKE_WINDOW_MS)
    arbiter.claim(0.5, (g) => verdicts.push(g))
    vi.advanceTimersByTime(WAKE_WINDOW_MS)
    expect(verdicts).toEqual([true, true])
  })
})
