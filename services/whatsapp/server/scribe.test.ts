import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { spokenText, transcribeFile } from './scribe.js'

describe('spokenText', () => {
  it('drops sound descriptions and tidies spacing', () => {
    expect(spokenText({ words: [{ text: 'Oi', type: 'word' }, { text: ' ', type: 'spacing' }, { text: '(risos)', type: 'audio_event' }, { text: 'tudo', type: 'word' }, { text: ' ', type: 'spacing' }, { text: 'bem', type: 'word' }] })).toBe('Oi tudo bem')
    expect(spokenText({ text: 'Oi (risos) tudo   bem' })).toBe('Oi tudo bem')
  })
})

describe('transcribeFile', () => {
  const file = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'wa-')), 'note.ogg')
    writeFileSync(path, 'audio')
    return path
  }

  it('needs the ElevenLabs key', async () => {
    await expect(transcribeFile(file(), fetch, {})).rejects.toThrow(/ELEVENLABS_API_KEY/)
  })

  it('sends the key and returns the words', async () => {
    let key: string | null = null
    const doFetch = (async (_url: unknown, init: RequestInit) => {
      key = new Headers(init.headers).get('xi-api-key')
      return new Response(JSON.stringify({ text: 'chego às oito' }))
    }) as unknown as typeof fetch
    expect(await transcribeFile(file(), doFetch, { ELEVENLABS_API_KEY: 'k' })).toBe('chego às oito')
    expect(key).toBe('k')
  })

  it('reports a failed call without leaking the key', async () => {
    const doFetch = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    await expect(transcribeFile(file(), doFetch, { ELEVENLABS_API_KEY: 'secret' })).rejects.toThrow('ElevenLabs answered 401 when transcribing')
  })
})
