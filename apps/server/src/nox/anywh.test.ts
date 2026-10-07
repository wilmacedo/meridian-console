import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { afterEach, describe, expect, it } from 'vitest'
import { Anywh, formatTranscript, loadProfiles } from './anywh.js'

const user = (text: string) => ({ type: 'user_message', text })
const agent = (text: string) => ({ type: 'text', text })

describe('formatTranscript', () => {
  it('keeps the last turns, summarizes tools and skips subagent events', () => {
    const events = [
      user('first'),
      agent('one'),
      user('second'),
      { type: 'tool_started', name: 'Bash', subject: { kind: 'shell', command: 'ls' } },
      { type: 'text', text: 'hidden', parentToolUseId: 'x' },
      agent('two'),
      { type: 'turn_started' },
    ]
    expect(formatTranscript(events, 1)).toBe('owner: second\n  [$ ls]\nagent: two\n[a turn is still running]')
  })

  it('drops the oldest lines past the budget', () => {
    const big = 'x'.repeat(1400)
    const events = Array.from({ length: 8 }, (_, i) => [user(`q${i}`), agent(big)]).flat()
    const out = formatTranscript(events, 8)
    expect(out.startsWith('[earlier lines omitted]')).toBe(true)
    expect(out).toContain('owner: q7')
    expect(out.length).toBeLessThan(8200)
  })
})

describe('against a fake relay', () => {
  const cleanup: (() => Promise<void>)[] = []
  afterEach(async () => {
    for (const fn of cleanup.splice(0)) await fn()
  })

  async function setup(pages: { messages: unknown[]; cursor: number; hasMore: boolean }[]) {
    const dir = await mkdtemp(join(tmpdir(), 'anywh-'))
    await mkdir(join(dir, 'env'))
    const received: Record<string, unknown>[] = []
    const app = Fastify()
    await app.register(websocket)
    app.get('/sessions', async () => ({ sessions: [{ id: 'known', title: 't', lastActiveAt: 5 }] }))
    app.get('/', { websocket: true }, (socket) => {
      socket.send(JSON.stringify({ type: 'protocol_version', version: 1 }))
      socket.send(JSON.stringify({ type: 'history_page', ...pages[0] }))
      socket.send(JSON.stringify({ type: 'caught_up' }))
      socket.on('message', (raw: Buffer) => {
        const m = JSON.parse(raw.toString())
        received.push(m)
        if (m.type === 'load_older_history') socket.send(JSON.stringify({ type: 'older_history', ...pages[1] }))
        if (m.type === 'user_message') {
          const live = (event: unknown) => socket.send(JSON.stringify({ type: 'agent_event', event }))
          live({ type: 'turn_ended', stopped: false })
          live({ type: 'turn_started' })
          live({ type: 'text', text: 'working on it' })
          live({ type: 'text', text: 'subagent noise', parentToolUseId: 'x' })
          live({ type: 'text', text: 'Done: 3 files changed.' })
          live({ type: 'turn_ended', stopped: false })
        }
      })
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const port = (app.server.address() as { port: number }).port
    await writeFile(join(dir, 'profiles.json'), JSON.stringify({ version: 1, profiles: [{ id: 'p', label: 'P' }, { id: 'ghost' }] }))
    await writeFile(join(dir, 'env', 'p.env'), `RELAY_PORT=${port}\nRELAY_HOST=127.0.0.1\nOTHER=1\n`)
    cleanup.push(() => app.close())
    return { anywh: new Anywh(dir), dir, received }
  }

  const ev = (event: unknown) => ({ type: 'agent_event', event })

  it('discovers profiles that have an env file', async () => {
    const { dir } = await setup([{ messages: [], cursor: 0, hasMore: false }])
    expect((await loadProfiles(dir)).map((p) => p.id)).toEqual(['p'])
    expect(await loadProfiles(join(dir, 'nowhere'))).toEqual([])
  })

  it('pages back until it has enough turns', async () => {
    const { anywh } = await setup([
      { messages: [ev(user('new')), ev(agent('answer'))], cursor: 2, hasMore: true },
      { messages: [ev(user('old')), ev(agent('earlier'))], cursor: 0, hasMore: false },
    ])
    expect(await anywh.read('p', 'known', 2)).toBe('owner: old\nagent: earlier\nowner: new\nagent: answer')
  })

  it('refuses a session that does not exist instead of creating it', async () => {
    const { anywh, received } = await setup([{ messages: [], cursor: 0, hasMore: false }])
    await expect(anywh.read('p', 'nope', 3)).rejects.toThrow('no session "nope"')
    await expect(anywh.send('p', 'hi', { session: 'nope' })).rejects.toThrow('no session')
    expect(received).toEqual([])
  })

  it('starts a new conversation with its working directory', async () => {
    const { anywh, received } = await setup([{ messages: [], cursor: 0, hasMore: false }])
    const { session: id, reply } = await anywh.send('p', 'hello', { cwd: '/tmp' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    // The turn that was already ending when the message arrived does not count; the last text of ours does.
    expect(await reply).toEqual({ text: 'Done: 3 files changed.', stopped: false, failed: false })
    expect(received).toEqual([{ type: 'set_cwd', path: '/tmp' }, { type: 'user_message', text: 'hello' }])
  })

  it('reports an unknown profile and a relay that is down', async () => {
    const { anywh, dir } = await setup([{ messages: [], cursor: 0, hasMore: false }])
    await expect(anywh.sessions('zzz')).rejects.toThrow('no anywh profile "zzz"')
    await writeFile(join(dir, 'env', 'p.env'), 'RELAY_PORT=1\n')
    await expect(anywh.sessions('p')).rejects.toThrow('may be down')
  })
})
