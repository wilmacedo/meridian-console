import Fastify from 'fastify'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import { VoiceMessages } from '../voice/voice-messages.js'
import { Approvals } from './approvals.js'
import type { Nox, NoxEvent } from './process.js'
import { registerNox } from './routes.js'

let dir: string

beforeAll(() => {
  vi.stubEnv('ELEVENLABS_API_KEY', 'key')
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice')
})
afterAll(() => vi.unstubAllEnvs())

beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'nox-routes-'))))
afterEach(() => rm(dir, { recursive: true, force: true }))

async function setup() {
  const said: string[] = []
  const nox = {
    async *say(text: string): AsyncGenerator<NoxEvent> {
      said.push(text)
      yield { type: 'done' }
    },
    interrupt: () => undefined,
  } as unknown as Nox
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const messages = new VoiceMessages(dir)
  const app = Fastify()
  const routes = registerNox(app, { nox, bus, screens, registry: { summaries: () => [] } as unknown as Registry, approvals: new Approvals(screens, bus), messages, wakeDir: join(dir, 'wake') })
  await app.ready()
  const record = (capture: boolean) =>
    app.inject({ method: 'POST', url: `/api/voice/ask?workspace=default${capture ? '&capture=1' : ''}`, headers: { 'content-type': 'audio/webm' }, payload: Buffer.from('opus') })
  return { said, messages, record, routes }
}

describe('a voice message NOX asked the owner to record', () => {
  it('is kept as a file and handed to NOX, never transcribed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { said, messages, record } = await setup()
    messages.arm('default', 'Maria')
    const res = await record(true)
    expect(res.statusCode).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    const [file] = await readdir(dir)
    expect(file).toMatch(/^message-.*\.webm$/)
    expect(said).toHaveLength(1)
    expect(said[0]).toMatch(/^\[voice message recorded\]/)
    expect(said[0]).toContain('for Maria')
    expect(said[0]).toContain(join(dir, file))
    fetchSpy.mockRestore()
  })

  it('is not captured when the screen did not record it as a message, and the request is dropped', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'abre os logs' })))
    const { said, messages, record } = await setup()
    messages.arm('default', 'Maria')
    await record(false)
    expect(await readdir(dir)).toEqual([])
    expect(said).toEqual(['abre os logs'])
    expect(messages.take('default')).toBeUndefined()
    fetchSpy.mockRestore()
  })

  it('is dropped, never transcribed, when nobody waits for it any more', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { said, messages, record } = await setup()
    expect((await record(true)).statusCode).toBe(409)
    messages.arm('default', 'Maria')
    expect((await record(true)).statusCode).toBe(200)
    expect((await record(true)).statusCode).toBe(409)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(said).toHaveLength(1)
    fetchSpy.mockRestore()
  })

  it('is not captured when the owner stopped NOX in between', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'abre os logs' })))
    const { said, messages, record, routes } = await setup()
    messages.arm('default', 'Maria')
    routes.interrupt()
    expect((await record(true)).statusCode).toBe(409)
    expect(await readdir(dir)).toEqual([])
    expect(said).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
