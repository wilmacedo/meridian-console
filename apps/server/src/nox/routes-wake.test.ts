import Fastify from 'fastify'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import { VoiceMessages } from '../voice/voice-messages.js'
import { WAKE_FILES } from '../voice/wake-word.js'
import { Approvals } from './approvals.js'
import type { Nox, NoxEvent } from './process.js'
import { registerNox } from './routes.js'

let wakeHome: string

beforeAll(() => {
  vi.stubEnv('ELEVENLABS_API_KEY', 'key')
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice')
})
afterAll(() => vi.unstubAllEnvs())

beforeEach(async () => {
  wakeHome = await mkdtemp(join(tmpdir(), 'nox-wake-'))
  for (const f of WAKE_FILES) await writeFile(join(wakeHome, f), 'onnx')
  await writeFile(join(wakeHome, 'wake.json'), JSON.stringify({ phrase: 'Ei NOX', heard: ['ei nox', 'nox'] }))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(wakeHome, { recursive: true, force: true })
})

async function setup(transcript: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: transcript })))
  const said: string[] = []
  const nox = {
    async *say(text: string): AsyncGenerator<NoxEvent> {
      said.push(text)
      yield { type: 'done' }
    },
    interrupt: () => undefined,
    conversations: { current: () => undefined },
  } as unknown as Nox
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const app = Fastify()
  registerNox(app, { nox, bus, screens, registry: { summaries: () => [] } as unknown as Registry, approvals: new Approvals(screens, bus), messages: new VoiceMessages(wakeHome), wakeDir: wakeHome })
  await app.ready()
  const record = (wake: boolean) =>
    app.inject({ method: 'POST', url: `/api/voice/ask?workspace=default${wake ? '&wake=1' : ''}`, headers: { 'content-type': 'audio/ogg' }, payload: Buffer.from('opus') })
  return { said, record }
}

describe('a recording the wake word started', () => {
  it('is answered without the wake word', async () => {
    const { said, record } = await setup('Ei, NOX, abre os logs.')
    expect((await record(true)).statusCode).toBe(200)
    expect(said).toEqual(['abre os logs.'])
  })

  it('is dropped when the wake word is not in it', async () => {
    const { said, record } = await setup('nós vamos abrir os logs')
    expect((await record(true)).statusCode).toBe(422)
    expect(said).toEqual([])
  })

  it('is dropped when the owner said only the wake word', async () => {
    const { said, record } = await setup('NOX.')
    expect((await record(true)).statusCode).toBe(422)
    expect(said).toEqual([])
  })

  it('leaves a recording a tap started alone', async () => {
    const { said, record } = await setup('nós vamos abrir os logs')
    expect((await record(false)).statusCode).toBe(200)
    expect(said).toEqual(['nós vamos abrir os logs'])
  })
})
