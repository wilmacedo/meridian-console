import { describe, expect, it } from 'vitest'
import { createTrigger, thresholdFor } from './wake-trigger'
import { createGate } from './wake-gate'
import { createDownsampler } from './downsample'

describe('createTrigger', () => {
  it('wakes on two scores in a row above the threshold, once per utterance', () => {
    const t = createTrigger()
    const at = (score: number, now: number) => t.push(score, now, 'normal', false)
    expect(at(0.9, 0)).toBe(false)
    expect(at(0.2, 80)).toBe(false)
    expect(at(0.9, 160)).toBe(false)
    expect(at(0.9, 240)).toBe(true)
    expect(at(0.9, 320)).toBe(false)
    expect(at(0.9, 400)).toBe(false)
    expect(at(0.9, 2400)).toBe(false)
    expect(at(0.9, 2480)).toBe(true)
  })

  it('asks for more while NOX is speaking', () => {
    expect(thresholdFor('normal', true)).toBeGreaterThan(thresholdFor('normal', false))
    expect(thresholdFor('low', true)).toBeLessThan(1)
    const t = createTrigger()
    t.push(0.6, 0, 'normal', true)
    expect(t.push(0.6, 80, 'normal', true)).toBe(false)
  })
})

describe('createGate', () => {
  it('stays shut in a quiet room and opens on a sound that stands out', () => {
    const gate = createGate()
    for (let i = 0; i < 30; i++) expect(gate.push(50)).toBe(false)
    expect(gate.push(3000)).toBe(true)
  })

  it('stays open a moment after the sound, then shuts', () => {
    const gate = createGate()
    for (let i = 0; i < 30; i++) gate.push(50)
    gate.push(3000)
    const after = Array.from({ length: 25 }, () => gate.push(50))
    expect(after.slice(0, 19).every(Boolean)).toBe(true)
    expect(after.at(-1)).toBe(false)
  })

  it('does not open on the steady noise of a loud room', () => {
    const gate = createGate()
    const opened = Array.from({ length: 80 }, () => gate.push(1000 + Math.random() * 50))
    expect(opened.slice(40).some(Boolean)).toBe(false)
  })
})

describe('createDownsampler', () => {
  it('brings 48 kHz to 16 kHz across calls, averaging each span', () => {
    const down = createDownsampler(48_000, 16_000)
    const out = [...down(Float32Array.from([1, 1, 1, 0, 0])), ...down(Float32Array.from([0, 3, 3, 3]))]
    expect(out).toEqual([1, 0, 3])
  })

  it('keeps the rate for 44.1 kHz', () => {
    const down = createDownsampler(44_100, 16_000)
    let n = 0
    for (let i = 0; i < 100; i++) n += down(new Float32Array(441)).length
    expect(Math.abs(n - 16_000)).toBeLessThanOrEqual(1)
  })
})
