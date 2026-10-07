import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StreamMessage } from '@meridian/service-sdk'
import * as eleven from './elevenlabs.js'
import { TurnSpeaker } from './speaker.js'

const config = { apiKey: 'k', voiceId: 'v', model: 'm' }

function setup(synth: (text: string) => Promise<Buffer>) {
  vi.spyOn(eleven, 'synthesize').mockImplementation((_c, text) => synth(text))
  const sent: StreamMessage[] = []
  const log = { firstAudio: 0, errors: [] as string[], spent: 0 }
  const speaker = new TurnSpeaker(config, 7, {
    send: (m) => (sent.push(m), true),
    onFirstAudio: () => log.firstAudio++,
    onError: (m) => log.errors.push(m),
    onSpent: (n) => (log.spent += n),
  })
  return { speaker, sent, log }
}

afterEach(() => vi.restoreAllMocks())

describe('TurnSpeaker', () => {
  it('delivers sentences in order even when a later one is synthesised first', async () => {
    const { speaker, sent } = setup(async (text) => {
      await new Promise((r) => setTimeout(r, text.startsWith('Primeira') ? 40 : 1))
      return Buffer.from(text)
    })
    speaker.push('Primeira frase bem comprida aqui. Segunda frase bem comprida aqui.')
    await speaker.finish()
    const speech = sent.filter((m) => m.type === 'speech')
    expect(speech.map((m) => Buffer.from((m as { audio: string }).audio, 'base64').toString())).toEqual(['Primeira frase bem comprida aqui.', 'Segunda frase bem comprida aqui.'])
    expect(speech.map((m) => (m as { seq: number }).seq)).toEqual([0, 1])
    expect(sent.at(-1)).toEqual({ type: 'speech_end', turn: 7 })
  })

  it('reports the first audio once, and the characters it spent', async () => {
    const { speaker, log } = setup(async (t) => Buffer.from(t))
    speaker.push('Primeira frase bem comprida aqui. Segunda frase bem comprida aqui.')
    await speaker.finish()
    expect(log.firstAudio).toBe(1)
    expect(log.spent).toBe('Primeira frase bem comprida aqui.'.length + 'Segunda frase bem comprida aqui.'.length)
  })

  it('speaks a half sentence at once when asked, instead of holding it to the end', async () => {
    const { speaker, sent } = setup(async (t) => Buffer.from(t))
    speaker.push('Vou pedir a sua confirmação')
    speaker.flush()
    await vi.waitFor(() => expect(sent.filter((m) => m.type === 'speech')).toHaveLength(1))
    expect(sent.some((m) => m.type === 'speech_end')).toBe(false)
  })

  it('stops synthesising and delivering once cancelled', async () => {
    const { speaker, sent } = setup(async (t) => {
      await new Promise((r) => setTimeout(r, 10))
      return Buffer.from(t)
    })
    speaker.push('Primeira frase bem comprida aqui. ')
    speaker.cancel()
    speaker.push('Segunda frase bem comprida aqui. ')
    speaker.flush()
    await speaker.finish()
    expect(sent.filter((m) => m.type === 'speech')).toHaveLength(0)
    expect(sent.at(-1)).toEqual({ type: 'speech_end', turn: 7 })
  })

  it('speaks a sentence handed to it at once, ahead of the text that follows', async () => {
    const { speaker, sent } = setup(async (t) => Buffer.from(t))
    speaker.say('Entendi, vou ver isso.')
    speaker.push('Depois a resposta completa aqui.')
    await speaker.finish()
    expect(sent.filter((m) => m.type === 'speech').map((m) => Buffer.from((m as { audio: string }).audio, 'base64').toString())).toEqual(['Entendi, vou ver isso.', 'Depois a resposta completa aqui.'])
  })

  it('does not speak a sentence handed to it after being cancelled', async () => {
    const { speaker, sent } = setup(async (t) => Buffer.from(t))
    speaker.cancel()
    speaker.say('Nunca dita.')
    await speaker.finish()
    expect(sent.filter((m) => m.type === 'speech')).toHaveLength(0)
  })

  it('survives a sentence failing while an earlier one is still being made, and reports it', async () => {
    const { speaker, sent, log } = setup(async (t) => {
      if (t.startsWith('Segunda')) throw new Error('429 too many concurrent requests')
      await new Promise((r) => setTimeout(r, 30))
      return Buffer.from(t)
    })
    speaker.push('Primeira frase bem comprida aqui. Segunda frase bem comprida aqui. Terceira frase bem comprida aqui.')
    await speaker.finish()
    expect(sent.filter((m) => m.type === 'speech')).toHaveLength(2)
    expect(log.errors).toEqual(['429 too many concurrent requests'])
  })

  it('speaks the trailing text on finish', async () => {
    const { speaker, sent } = setup(async (t) => Buffer.from(t))
    speaker.push('Tudo certo por aqui')
    await speaker.finish()
    expect(sent.filter((m) => m.type === 'speech')).toHaveLength(1)
  })

  it('skips a sentence that fails and keeps the rest', async () => {
    const { speaker, sent, log } = setup(async (t) => (t.startsWith('Primeira') ? Promise.reject(new Error('boom')) : Buffer.from(t)))
    speaker.push('Primeira frase bem comprida aqui. Segunda frase bem comprida aqui.')
    await speaker.finish()
    expect(log.errors).toEqual(['boom'])
    expect(sent.filter((m) => m.type === 'speech')).toHaveLength(1)
    expect(sent.at(-1)).toEqual({ type: 'speech_end', turn: 7 })
  })
})
