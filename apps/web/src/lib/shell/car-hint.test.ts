import { describe, expect, it } from 'vitest'
import { carHint, type CarHintInput } from './car-hint'

const state = (extra: Partial<CarHintInput> = {}): CarHintInput => ({ mode: 'idle', listenedSeconds: 0, halted: false, busy: false, ...extra })

describe('carHint', () => {
  it('invites a tap when nothing is going on', () => {
    expect(carHint(state())).toBe('TAP TO TALK')
  })

  it('counts the time while listening', () => {
    expect(carHint(state({ mode: 'listening', listenedSeconds: 7 }))).toBe('00:07 · TAP TO SEND')
    expect(carHint(state({ mode: 'listening', listenedSeconds: 75 }))).toBe('01:15 · TAP TO SEND')
  })

  it('says a tap stops what is sending or running', () => {
    expect(carHint(state({ mode: 'thinking' }))).toBe('SENDING · TAP TO STOP')
    expect(carHint(state({ mode: 'speaking', busy: true }))).toBe('TAP TO STOP NOX')
  })

  it('says NOX was halted, but not while listening again', () => {
    expect(carHint(state({ halted: true }))).toBe('NOX HALTED')
    expect(carHint(state({ mode: 'listening', halted: true }))).toContain('TAP TO SEND')
  })

  it('says it is booting', () => {
    expect(carHint(state({ mode: 'boot' }))).toBe('BOOTING')
  })
})
