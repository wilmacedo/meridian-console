import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from './speech-detector'
import { CAR_WORKSPACE, defaultVoicePrefs, sanitizeVoice, tuningFor } from './voice-prefs'

describe('voice prefs', () => {
  it('start plain everywhere but the car workspace', () => {
    expect(defaultVoicePrefs('default')).toMatchObject({ noise: 'off', warmup: false })
    expect(defaultVoicePrefs(CAR_WORKSPACE)).toMatchObject({ noise: 'normal', warmup: true })
  })

  it('fall back to the workspace default for what was never stored', () => {
    expect(sanitizeVoice(undefined, CAR_WORKSPACE)).toEqual(defaultVoicePrefs(CAR_WORKSPACE))
    expect(sanitizeVoice({ noise: 'strict' }, CAR_WORKSPACE)).toMatchObject({ noise: 'strict', warmup: true })
  })

  it('drop values that are no longer valid', () => {
    const stored = { noise: 'loud', warmup: 'yes', tailMs: 'long', audioSession: 'speaker' }
    expect(sanitizeVoice(stored, 'default')).toEqual(defaultVoicePrefs('default'))
  })

  it('keep the tail inside the slider', () => {
    expect(sanitizeVoice({ tailMs: 99_999 }, 'default').tailMs).toBe(2000)
    expect(sanitizeVoice({ tailMs: -5 }, 'default').tailMs).toBe(0)
    expect(sanitizeVoice({ tailMs: 540 }, 'default').tailMs).toBe(500)
  })

  it('use the plain detector when the filter is off', () => {
    expect(tuningFor('off')).toBe(DEFAULT_TUNING)
    expect(tuningFor('strict').minVoicedMs).toBeGreaterThan(tuningFor('normal').minVoicedMs)
    expect(tuningFor('normal').maxMs).toBe(60_000)
  })
})
