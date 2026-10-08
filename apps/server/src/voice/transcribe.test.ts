import { describe, expect, it } from 'vitest'
import { BASE_KEYTERMS, isSpeech, keytermsFor, speechOf } from './transcribe.js'

describe('keytermsFor', () => {
  it('adds the service names to the fixed vocabulary, without duplicates', () => {
    const terms = keytermsFor(['aqw-idle', 'pet-feeder', 'Docker'])
    expect(terms).toEqual(expect.arrayContaining([...BASE_KEYTERMS, 'aqw-idle', 'pet-feeder']))
    expect(terms.filter((t) => t === 'Docker')).toHaveLength(1)
  })
})

const word = (text: string, logprob = -0.1) => ({ text, type: 'word' as const, logprob })
const space = { text: ' ', type: 'spacing' as const }
const event = (text: string) => ({ text, type: 'audio_event' as const })

describe('speechOf', () => {
  it('leaves out the sounds Scribe describes', () => {
    const heard = speechOf({ words: [event('(batida de porta)'), space, word('abre'), space, word('os'), space, word('logs')] })
    expect(heard.text).toBe('abre os logs')
    expect(heard.words).toBe(3)
  })

  it('has no words when only noise was heard', () => {
    const heard = speechOf({ words: [event('(buzina)')] })
    expect(heard).toMatchObject({ text: '', words: 0 })
    expect(isSpeech(heard, 'normal')).toBe(false)
  })

  it('strips described sounds from a plain text answer', () => {
    expect(speechOf({ text: '(buzina) fecha tudo [música]' })).toMatchObject({ text: 'fecha tudo', words: 2 })
  })

  it('averages the confidence of the words', () => {
    expect(speechOf({ words: [word('a', -0.2), space, word('b', -0.6)] }).confidence).toBeCloseTo(-0.4)
  })
})

describe('isSpeech', () => {
  it('answers a single word normally, but not in strict mode', () => {
    const one = speechOf({ words: [word('sim')] })
    expect(isSpeech(one, 'normal')).toBe(true)
    expect(isSpeech(one, 'strict')).toBe(false)
  })

  it('drops low-confidence mumbling in strict mode only', () => {
    const mumble = speechOf({ words: [word('a', -2), space, word('b', -2)] })
    expect(isSpeech(mumble, 'normal')).toBe(true)
    expect(isSpeech(mumble, 'strict')).toBe(false)
  })
})
