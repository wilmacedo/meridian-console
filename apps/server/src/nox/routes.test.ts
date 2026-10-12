import Fastify from 'fastify'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import { playbackDone } from '../voice/playback.js'
import { VoiceMessages } from '../voice/voice-messages.js'
import type { StreamMessage } from '@meridian/service-sdk'
import { Approvals } from './approvals.js'
import type { Nox, NoxEvent, Switch } from './process.js'
import { registerNox } from './routes.js'

let dir: string

beforeAll(() => {
  vi.stubEnv('ELEVENLABS_API_KEY', 'key')
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice')
})
afterAll(() => vi.unstubAllEnvs())

beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'nox-routes-'))))
afterEach(() => rm(dir, { recursive: true, force: true }))

async function setup(hint?: (text: string) => string | undefined) {
  const said: string[] = []
  const turns: { text: string; to?: Switch }[] = []
  // What NOX does during a turn, as its tools would.
  const during: { act?: (text: string) => void; script?: NoxEvent[] } = {}
  const current = { id: 'c1', title: 'baixa', lastUsed: Date.now() }
  const nox = {
    async *say(text: string, _workspace: string, _screen?: string, options: { to?: Switch } = {}): AsyncGenerator<NoxEvent> {
      said.push(text)
      turns.push(options.to ? { text, to: options.to } : { text })
      during.act?.(text)
      yield* during.script ?? []
      yield { type: 'done' }
    },
    interrupt: () => undefined,
    conversations: { current: () => current, get: (id: string) => (id === 'c0' || id === 'c1' ? { ...current, id } : undefined) },
  } as unknown as Nox
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const messages = new VoiceMessages(dir)
  const app = Fastify()
  const approvals = new Approvals(screens, bus)
  const routes = registerNox(app, { nox, bus, screens, registry: { summaries: () => [] } as unknown as Registry, approvals, messages, wakeDir: join(dir, 'wake'), hint })
  await app.ready()
  const record = (capture: boolean, query = '') =>
    app.inject({ method: 'POST', url: `/api/voice/ask?workspace=default${capture ? '&capture=1' : ''}${query}`, headers: { 'content-type': 'audio/webm' }, payload: Buffer.from('opus') })
  const say = async (text: string) => (await app.inject({ method: 'POST', url: '/api/nox/say', payload: { text } })).body.trim().split('\n').map((l) => JSON.parse(l) as NoxEvent)
  return { said, turns, during, current, messages, record, routes, say, approvals, screens }
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

describe('conversations, one per subject', () => {
  it('takes a clear new subject to a new conversation, saying the owner\'s words again there as one answer', async () => {
    const { turns, during, routes, say } = await setup()
    during.act = (text) => (text === 'liga o KVM' && turns.length === 1 ? routes.conversations.start('KVM') : undefined)
    expect(await say('liga o KVM')).toEqual([{ type: 'done' }])
    expect(turns).toEqual([{ text: 'liga o KVM' }, { text: 'liga o KVM', to: { to: 'new', title: 'KVM' } }])
  })

  it('asks when unsure: a bare yes starts the new conversation with the waiting request, without asking NOX what it means', async () => {
    const { turns, during, routes, say } = await setup()
    during.act = (text) => (text === 'e os tickets?' ? routes.conversations.offer('Tickets') : undefined)
    await say('e os tickets?')
    during.act = undefined
    await say('sim')
    expect(turns).toEqual([{ text: 'e os tickets?' }, { text: 'e os tickets?', to: { to: 'new', title: 'Tickets' } }])
  })

  it('stays on a bare no, and lets anything longer through as it was said', async () => {
    const { said, during, routes, say } = await setup()
    const offer = (text: string) => (text === 'e os tickets?' ? routes.conversations.offer('Tickets') : undefined)
    during.act = offer
    await say('e os tickets?')
    await say('não')
    expect(said.at(-1)).toBe('[The owner wants to stay in this conversation.] não')
    await say('e os tickets?')
    await say('sim, e abre o ticket do Mac mini também')
    expect(said.at(-1)).toBe('sim, e abre o ticket do Mac mini também')
    // An offer is answered once: a later "sim" is just something said.
    await say('sim')
    expect(said.at(-1)).toBe('sim')
  })

  it('goes back to an earlier conversation with the owner\'s words, but not to the one it is in', async () => {
    const { turns, during, routes, say } = await setup()
    const errors: string[] = []
    during.act = (text) => {
      if (turns.length > 1) return
      try {
        routes.conversations.resume(text === 'volta no KVM' ? 'c0' : 'c1')
      } catch (err) {
        errors.push((err as Error).message)
      }
    }
    await say('volta no KVM')
    expect(turns).toEqual([{ text: 'volta no KVM' }, { text: 'volta no KVM', to: { to: 'resume', id: 'c0' } }])
    turns.length = 0
    await say('volta no baixa')
    expect(errors).toEqual(['that is the conversation you are in'])
  })

  it('tells NOX how long the owner was away, when it was a while', async () => {
    const { said, current, say } = await setup()
    await say('oi')
    current.lastUsed = Date.now() - 3 * 3_600_000
    await say('e o baixa?')
    expect(said).toEqual(['oi', "[The owner's last message here was 3 hours ago.] e o baixa?"])
  })

  it('never moves while a message waits to be recorded, nor in a turn that is not the owner\'s', async () => {
    const { turns, during, messages, routes, say } = await setup()
    const errors: string[] = []
    during.act = () => {
      try {
        routes.conversations.start('outro')
      } catch (err) {
        errors.push((err as Error).message)
      }
    }
    messages.arm('default', 'Maria')
    await say('liga o KVM')
    messages.disarm()
    routes.announce('[anywhere update] done', 'default')
    await vi.waitFor(() => expect(errors).toHaveLength(2))
    expect(errors).toEqual(['a voice message is waiting to be recorded; finish it here first', 'only while answering the owner'])
    expect(turns.every((t) => !t.to)).toBe(true)
  })
})

describe('a hint before what the owner said', () => {
  it('reaches NOX in front of the owner\'s words, and only when there is one', async () => {
    const { said, say } = await setup((text) => (text.startsWith('bom dia') ? '[The owner may have said the activation phrase of the routine "Bom dia" (bom-dia).]' : undefined))
    await say('bom dia nox')
    await say('abre a telemetria')
    expect(said[0]).toBe('[The owner may have said the activation phrase of the routine "Bom dia" (bom-dia).] bom dia nox')
    expect(said[1]).toBe('abre a telemetria')
  })
})

describe('ending the conversation', () => {
  it('says nothing NOX writes after it ends the conversation', async () => {
    const { during, say } = await setup()
    during.script = [
      { type: 'text', text: 'Por nada, até mais.' },
      { type: 'tool', name: 'end_conversation' },
      { type: 'tool', name: 'end_conversation' },
      { type: 'text', text: 'Valeu.' },
    ]
    const events = await say('valeu, é só isso')
    expect(events.filter((e) => e.type === 'text')).toEqual([{ type: 'text', text: 'Por nada, até mais.' }])
  })
})

describe('what the owner says while a card waits', () => {
  const heard = (text: string) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text })))

  it('answers the card, and starts no turn', async () => {
    const fetchSpy = heard('Sim, pode.')
    const { said, record, approvals, screens } = await setup()
    screens.watch(screens.add(() => undefined), 'default')
    const result = approvals.ask('default', 'service_calendar_create-event', { command: 'Dentista amanhã às dez' })
    await vi.waitFor(() => expect(approvals.has('default')).toBe(true))
    const res = await record(false, '&card=1')
    expect(res.json()).toEqual({ heard: 'Sim, pode.', answeredCard: true })
    await expect(result).resolves.toBe(true)
    expect(said).toEqual([])
    fetchSpy.mockRestore()
  })

  it('goes up once NOX has said what it asks, which it says for it when it said nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1])))
    const { during, say, approvals, screens } = await setup()
    const shown: StreamMessage[] = []
    screens.watch(screens.add((m) => shown.push(m)), 'default')
    let result: Promise<boolean> | undefined
    during.act = () => void (result = approvals.ask('default', 'service_calendar_create-event', { command: 'Dentista' }))
    await say('marca o dentista amanhã às dez')
    await vi.waitFor(() => expect(shown.some((m) => m.type === 'approval')).toBe(true))
    const spoken = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { text: string }
    expect(spoken.text).toBe('Preciso da sua confirmação.')
    expect(shown.findIndex((m) => m.type === 'speech')).toBeLessThan(shown.findIndex((m) => m.type === 'approval'))
    approvals.answerLatest('default', false)
    await expect(result).resolves.toBe(false)
    const speech = shown.find((m) => m.type === 'speech')
    if (speech?.type === 'speech') playbackDone(speech.turn)
    fetchSpy.mockRestore()
  })
})
