import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demuxLogs, type DockerApi } from './docker.js'
import { buildManagedService, ManagedServiceStore, validateSpec } from './managed-services.js'

describe('validateSpec', () => {
  it('accepts a container service and drops what is empty', () => {
    expect(validateSpec({ id: 'baixa', name: 'Baixa', desc: '', container: 'baixa-baixa-1', mono: 'bx', url: 'http://host:21832' })).toEqual({
      id: 'baixa',
      name: 'Baixa',
      desc: '',
      mono: 'BX',
      container: 'baixa-baixa-1',
      url: 'http://host:21832',
    })
  })

  it('says what is wrong, in words NOX can act on', () => {
    expect(() => validateSpec('x')).toThrow('expected an object')
    expect(() => validateSpec({ name: 'X' })).toThrow('id is required')
    expect(() => validateSpec({ id: 'Bad Id', name: 'X' })).toThrow('kebab-case')
    expect(() => validateSpec({ id: 'x' })).toThrow('name is required')
    expect(() => validateSpec({ id: 'x', name: 'X', container: '../etc' })).toThrow('valid Docker container name')
    expect(() => validateSpec({ id: 'x', name: 'X', url: 'file:///etc/passwd' })).toThrow('url must be an http or https URL')
    expect(() => validateSpec({ id: 'x', name: 'X', healthUrl: 'nope' })).toThrow('healthUrl must be an http or https URL')
    expect(() => validateSpec({ id: 'x', name: 'X', mono: 'abc' })).toThrow('mono')
    expect(() => validateSpec({ id: 'x', name: 'X', command: 'rm -rf /' })).toThrow('unknown field: command')
  })
})

describe('ManagedServiceStore', () => {
  it('keeps, replaces and forgets services', () => {
    const store = new ManagedServiceStore(new DatabaseSync(':memory:'))
    store.put({ id: 'a', name: 'A', desc: '' })
    store.put({ id: 'a', name: 'A2', desc: 'd' })
    store.put({ id: 'b', name: 'B', desc: '' })
    expect(store.list().map((s) => s.name)).toEqual(['A2', 'B'])
    expect(store.get('a')?.desc).toBe('d')
    expect(store.delete('a')).toBe(true)
    expect(store.delete('a')).toBe(false)
    expect(store.get('a')).toBeUndefined()
  })
})

function fakeDocker(state: { state: string; health?: string } | undefined) {
  const calls: string[] = []
  const api: DockerApi = {
    inspect: async () => state && { ...state, startedAt: '2026-10-07T00:00:00Z', image: 'img' },
    logs: async (name, lines) => (calls.push(`logs ${name} ${lines}`), 'line 1\nline 2'),
    control: async (name, verb) => void calls.push(`${verb} ${name}`),
  }
  return { api, calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('buildManagedService', () => {
  it('reads its status from the container', async () => {
    const spec = { id: 'baixa', name: 'Baixa', desc: '', container: 'baixa-baixa-1' }
    expect(await buildManagedService(spec, fakeDocker({ state: 'running' }).api).status!()).toEqual({ state: 'online', message: undefined })
    expect(await buildManagedService(spec, fakeDocker({ state: 'exited' }).api).status!()).toEqual({ state: 'offline', message: 'exited' })
    expect(await buildManagedService(spec, fakeDocker({ state: 'running', health: 'unhealthy' }).api).status!()).toEqual({ state: 'degraded', message: 'unhealthy' })
    expect(await buildManagedService(spec, fakeDocker(undefined).api).status!()).toEqual({ state: 'offline', message: 'container not found' })
  })

  it('adds the health URL to the verdict: down is degraded for a container, offline on its own', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 502 }))
    const withContainer = { id: 'a', name: 'A', desc: '', container: 'c', healthUrl: 'http://x/' }
    expect(await buildManagedService(withContainer, fakeDocker({ state: 'running' }).api).status!()).toEqual({ state: 'degraded', message: 'health check failed' })
    expect(await buildManagedService({ id: 'a', name: 'A', desc: '', healthUrl: 'http://x/' }, fakeDocker(undefined).api).status!()).toEqual({ state: 'offline', message: 'health check failed' })
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect(await buildManagedService({ id: 'a', name: 'A', desc: '', healthUrl: 'http://x/' }, fakeDocker(undefined).api).status!()).toEqual({ state: 'online', message: undefined })
  })

  it('says so when there is nothing to watch', async () => {
    expect(await buildManagedService({ id: 'a', name: 'A', desc: '' }, fakeDocker(undefined).api).status!()).toEqual({ state: 'online', message: 'not monitored' })
  })

  it('gives a container service read and control actions, with only the control ones mutating', async () => {
    const { api, calls } = fakeDocker({ state: 'running' })
    const service = buildManagedService({ id: 'baixa', name: 'Baixa', desc: '', container: 'baixa-baixa-1' }, api)
    expect(service.manifest.runtime).toBe('docker')
    expect(service.actions!.map((a) => [a.id, a.mutating])).toEqual([['details', false], ['logs', false], ['start', true], ['stop', true], ['restart', true]])
    const run = (id: string, input?: unknown) => (service.actions!.find((a) => a.id === id)!.run as (i: unknown) => Promise<unknown>)(input)
    expect(await run('logs', { lines: 9999 })).toBe('line 1\nline 2')
    expect(await run('logs')).toBe('line 1\nline 2')
    await run('restart')
    expect(calls).toEqual(['logs baixa-baixa-1 200', 'logs baixa-baixa-1 50', 'restart baixa-baixa-1'])
  })

  it('has no actions without a container', () => {
    expect(buildManagedService({ id: 'a', name: 'A', desc: '', healthUrl: 'http://x/' }, fakeDocker(undefined).api).actions).toBeUndefined()
  })
})

describe('demuxLogs', () => {
  const frame = (stream: number, text: string) => {
    const payload = Buffer.from(text)
    const header = Buffer.alloc(8)
    header[0] = stream
    header.writeUInt32BE(payload.length, 4)
    return Buffer.concat([header, payload])
  }

  it('strips the frame headers of a log without a TTY', () => {
    expect(demuxLogs(Buffer.concat([frame(1, 'out\n'), frame(2, 'err\n')]), false)).toBe('out\nerr\n')
  })

  it('leaves a TTY log alone', () => {
    expect(demuxLogs(Buffer.from('plain\n'), true)).toBe('plain\n')
  })
})
