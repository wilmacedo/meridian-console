import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from './speech-detector'
import { defaultVoicePrefs, followCarplay, sanitizeVoice, tuningFor } from './voice-prefs'

describe('voice prefs', () => {
  it('start plain unless the workspace is in CarPlay mode', () => {
    expect(defaultVoicePrefs(false)).toMatchObject({ noise: 'off', warmup: false })
    expect(defaultVoicePrefs(true)).toMatchObject({ noise: 'normal', warmup: true })
  })

  it('fall back to the workspace default for what was never stored', () => {
    expect(sanitizeVoice(undefined, true)).toEqual(defaultVoicePrefs(true))
    expect(sanitizeVoice({ noise: 'strict' }, true)).toMatchObject({ noise: 'strict', warmup: true })
  })

  it('drop values that are no longer valid', () => {
    const stored = { noise: 'loud', warmup: 'yes', tailMs: 'long', audioSession: 'speaker' }
    expect(sanitizeVoice(stored, false)).toEqual(defaultVoicePrefs(false))
  })

  it('keep the tail inside the slider', () => {
    expect(sanitizeVoice({ tailMs: 99_999 }, false).tailMs).toBe(2000)
    expect(sanitizeVoice({ tailMs: -5 }, false).tailMs).toBe(0)
    expect(sanitizeVoice({ tailMs: 540 }, false).tailMs).toBe(500)
  })

  it('use the plain detector when the filter is off', () => {
    expect(tuningFor('off')).toBe(DEFAULT_TUNING)
    expect(tuningFor('strict').minVoicedMs).toBeGreaterThan(tuningFor('normal').minVoicedMs)
    expect(tuningFor('normal').maxMs).toBe(DEFAULT_TUNING.maxMs)
  })
})

describe('followCarplay', () => {
  it('moves untouched options to the new mode defaults, both ways', () => {
    expect(followCarplay(defaultVoicePrefs(false), false, true)).toEqual(defaultVoicePrefs(true))
    expect(followCarplay(defaultVoicePrefs(true), true, false)).toEqual(defaultVoicePrefs(false))
  })

  it('keeps what the owner changed', () => {
    const tuned = { ...defaultVoicePrefs(false), tailMs: 900 }
    expect(followCarplay(tuned, false, true)).toBe(tuned)
  })
})
