import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import type { DockerApi } from './docker.js'
import { EventBus } from './event-bus.js'
import { ManagedServiceStore } from './managed-services.js'

async function setup(state: { state: string } = { state: 'running' }) {
  // The services folder is read when the module loads, so point it at an empty one first.
  vi.stubEnv('SERVICES_DIR', mkdtempSync(join(tmpdir(), 'meridian-services-')))
  vi.resetModules()
  const { registerServices } = await import('./service-registry.js')
  const calls: string[] = []
  const docker: DockerApi = {
    inspect: async () => ({ ...state, startedAt: '2026-10-07T00:00:00Z', image: 'img' }),
    logs: async () => 'log line',
    control: async (name, verb) => void calls.push(`${verb} ${name}`),
  }
  const app = Fastify()
  const bus = new EventBus()
  const store = new ManagedServiceStore(new DatabaseSync(':memory:'))
  const registry = await registerServices(app, bus, { store, docker })
  await app.ready()
  return { app, bus, store, registry, calls }
}

describe('managed services in the registry', () => {
  it('adds a service while running: it is listed, flagged as managed, watched and stored', async () => {
    const { registry, store } = await setup()
    let changes = 0
    registry.onChange(() => changes++)
    await registry.managed.upsert({ id: 'baixa', name: 'Baixa', desc: 'downloader', container: 'baixa-baixa-1' })
    const [summary] = registry.summaries()
    expect(summary).toMatchObject({ id: 'baixa', managed: true, mono: 'BA', runtime: 'docker', status: { state: 'online' } })
    expect(summary.actions.map((a) => a.id)).toEqual(['details', 'logs', 'start', 'stop', 'restart'])
    expect(changes).toBe(1)
    expect(store.get('baixa')?.name).toBe('Baixa')
  })

  it('runs its actions through the shared route and through the registry, and logs them', async () => {
    const { app, bus, registry, calls } = await setup()
    await registry.managed.upsert({ id: 'baixa', name: 'Baixa', desc: '', container: 'c1' })
    const res = await app.inject({ method: 'POST', url: '/api/services/baixa/actions/restart' })
    expect(res.json()).toMatchObject({ ok: true, result: { container: 'c1', did: 'restart' } })
    expect((await registry.run('baixa', 'logs', { lines: 5 })).result).toBe('log line')
    expect(calls).toEqual(['restart c1'])
    expect(bus.recent().some((e) => e.source === 'baixa' && e.message.includes('/restart'))).toBe(true)
    expect((await app.inject({ method: 'POST', url: '/api/services/ghost/actions/restart' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/services/baixa/actions/nope' })).statusCode).toBe(500)
  })

  it('replaces a service on edit, reports a change of state, and forgets one on remove', async () => {
    const state = { state: 'running' }
    const { registry, store, bus } = await setup(state)
    await registry.managed.upsert({ id: 'baixa', name: 'Baixa', desc: '', container: 'c1' })
    await registry.managed.upsert({ id: 'baixa', name: 'Baixa 2', desc: '', container: 'c1' })
    expect(registry.summaries().map((s) => s.name)).toEqual(['Baixa 2'])
    expect(registry.managed.remove('baixa')).toBe(true)
    expect(registry.managed.remove('baixa')).toBe(false)
    expect(registry.summaries()).toEqual([])
    expect(store.get('baixa')).toBeUndefined()
    expect(bus.recent()).toEqual([])
  })

  it('brings back what was stored before a restart', async () => {
    const { store } = await setup()
    store.put({ id: 'old', name: 'Old', desc: '' })
    const { registerServices } = await import('./service-registry.js')
    const registry = await registerServices(Fastify(), new EventBus(), { store, docker: { inspect: async () => undefined, logs: async () => '', control: async () => undefined } })
    expect(registry.summaries().map((s) => s.id)).toEqual(['old'])
  })
})
