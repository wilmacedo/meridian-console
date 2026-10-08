import Fastify from 'fastify'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { afterWakeWord, registerWakeWord, WAKE_FILES, wakeConfig } from './wake-word.js'

describe('afterWakeWord', () => {
  const heard = ['ei nox', 'nox', 'knox']

  it('returns what was asked after the word, in any case and with or without accents', () => {
    expect(afterWakeWord('Ei NOX, abre a telemetria.', heard)).toBe('abre a telemetria.')
    expect(afterWakeWord('Nóx abre os logs', heard)).toBe('abre os logs')
    expect(afterWakeWord('Knox! Para.', heard)).toBe('Para.')
  })

  it('allows a few words said before it, which the recording reaches back to', () => {
    expect(afterWakeWord('então tá. NOX, desliga a luz', heard)).toBe('desliga a luz')
    expect(afterWakeWord('um dois três quatro cinco NOX desliga', heard)).toBeUndefined()
  })

  it('is empty for the word alone and undefined without it', () => {
    expect(afterWakeWord('NOX.', heard)).toBe('')
    expect(afterWakeWord('nós vamos abrir os logs', heard)).toBeUndefined()
    expect(afterWakeWord('noxa', heard)).toBeUndefined()
  })
})

describe('the wake word model', () => {
  let dir: string
  beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'wake-'))))
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const install = async (config: unknown): Promise<void> => {
    for (const f of WAKE_FILES) await writeFile(join(dir, f), f)
    await writeFile(join(dir, 'wake.json'), JSON.stringify(config))
  }

  it('is there only with every file and a phrase', async () => {
    expect(wakeConfig(dir)).toBeUndefined()
    await install({ heard: ['nox'] })
    expect(wakeConfig(dir)).toBeUndefined()
    await install({ phrase: 'Ei NOX' })
    expect(wakeConfig(dir)).toEqual({ phrase: 'Ei NOX', heard: ['Ei NOX'] })
  })

  it('serves the phrase and the files, and nothing else from the folder', async () => {
    const app = Fastify()
    registerWakeWord(app, dir)
    expect((await app.inject('/api/voice/wake')).statusCode).toBe(404)
    await install({ phrase: 'Ei NOX', heard: ['ei nox'] })
    expect((await app.inject('/api/voice/wake')).json()).toEqual({ phrase: 'Ei NOX' })
    const file = await app.inject('/api/voice/wake/wake.onnx')
    expect(file.body).toBe('wake.onnx')
    expect((await app.inject({ url: '/api/voice/wake/wake.onnx', headers: { 'if-none-match': file.headers.etag as string } })).statusCode).toBe(304)
    expect((await app.inject('/api/voice/wake/wake.json')).statusCode).toBe(404)
    expect((await app.inject('/api/voice/wake/..%2Fwake.json')).statusCode).toBe(404)
  })
})
