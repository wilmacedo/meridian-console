import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ServiceSummary, StreamMessage } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import type { HostTelemetry } from '../telemetry.js'
import { WorkspaceStore } from '../workspace-store.js'
import { buildTools } from './tools.js'

const summary = (id: string, actions: ServiceSummary['actions']): ServiceSummary => ({ id, name: id, mono: 'XX', desc: 'd', status: { state: 'online' }, actions, emitsEvents: false })

function setup(services: ServiceSummary[] = []) {
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const workspaces = new WorkspaceStore(new DatabaseSync(':memory:'))
  const sent: StreamMessage[] = []
  screens.watch(screens.add((m) => sent.push(m)), 'default')
  const ran: string[] = []
  const registry = { summaries: () => services, run: async (s: string, a: string) => (ran.push(`${s}/${a}`), { ms: 1, result: { ok: true } }) } as unknown as Registry
  const telemetry = { samples: () => [{ cpu: 23.4, mem: 4.2, temp: 55, net: 0 }], containers: () => [], memTotalGb: 15.3 } as unknown as HostTelemetry
  const tools = buildTools({ bus, registry, telemetry, workspaces, screens, hostName: () => 'box', currentWorkspace: () => 'default' })
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.find((t) => t.name === name)
    if (!tool) throw new Error(`no tool ${name}`)
    return tool.handler(args)
  }
  const commands = () => sent.filter((m) => m.type === 'command').map((m) => (m as { command: unknown }).command)
  return { call, commands, bus, ran, tools }
}

describe('NOX tools', () => {
  it('opens windows on the current workspace, mapping events to the logs window', async () => {
    const { call, commands, bus } = setup()
    await call('open_window', { window: 'telemetry' })
    await call('open_window', { window: 'events' })
    await call('open_window', { window: 'aqw-idle:console' })
    expect(commands()).toEqual([
      { name: 'open_window', window: 'telemetry' },
      { name: 'open_window', window: 'logs' },
      { name: 'open_window', window: 'aqw-idle:console' },
    ])
    expect(bus.recent().every((e) => e.source === 'nox')).toBe(true)
  })

  it('rejects an unknown window and an unknown workspace', async () => {
    const { call } = setup()
    await expect(call('open_window', { window: 'settings' })).rejects.toThrow('window must be one of')
    await expect(call('open_window', { window: 'services', workspace: 'ghost' })).rejects.toThrow('no workspace "ghost"')
  })

  it('validates theme input', async () => {
    const { call, commands } = setup()
    await expect(call('set_theme', {})).rejects.toThrow('give a mode')
    await expect(call('set_theme', { palette: 'neon' })).rejects.toThrow('palette must be one of')
    await call('set_theme', { mode: 'dark', palette: 'meridian' })
    expect(commands()).toEqual([{ name: 'set_theme', mode: 'dark', palette: 'meridian' }])
  })

  it('validates documents before any screen sees them', async () => {
    const { call, commands } = setup()
    await expect(call('compose_doc', { title: 'T', blocks: [{ t: 'chart' }] })).rejects.toThrow('unknown block type')
    expect(commands()).toEqual([])
    await call('compose_doc', { title: 'T', blocks: [{ t: 'p', text: 'x' }] })
    expect(commands()).toEqual([{ name: 'compose_doc', doc: { title: 'T', kicker: '', blocks: [{ t: 'p', text: 'x' }] } }])
  })

  it('lists workspaces with the screens showing them', async () => {
    const { call } = setup()
    expect(JSON.parse(await call('list_workspaces'))).toEqual([{ id: 'default', name: 'Default', screens: 1 }])
  })

  it('filters events and limits them', async () => {
    const { call, bus } = setup()
    bus.emit('aqw-idle', 'info', 'a')
    bus.emit('tuya-feeder', 'warn', 'b')
    bus.emit('aqw-idle', 'error', 'c')
    expect((await call('query_events', { source: 'aqw-idle' })).split('\n')).toHaveLength(2)
    expect(await call('query_events', { level: 'warn' })).toContain('b')
    expect((await call('query_events', { limit: 1 })).split('\n')).toHaveLength(1)
    expect(await call('query_events', { source: 'nope' })).toBe('No matching events.')
  })

  it('exposes only read-only service actions as tools', async () => {
    const read = { id: 'status', method: 'GET' as const, path: '/status', title: 'Status', description: 'Reads', mutating: false }
    const write = { id: 'feed', method: 'POST' as const, path: '/feed', title: 'Feed', description: 'Dispenses', mutating: true }
    const { tools, call, ran } = setup([summary('pet-feeder', [read, write])])
    expect(tools.map((t) => t.name)).toContain('service_pet-feeder_status')
    expect(tools.map((t) => t.name)).not.toContain('service_pet-feeder_feed')
    await call('service_pet-feeder_status')
    expect(ran).toEqual(['pet-feeder/status'])
  })

  it('summarises status for the model', async () => {
    const { call } = setup([summary('aqw-idle', [])])
    expect(JSON.parse(await call('get_status'))).toMatchObject({ host: 'box', telemetry: { cpuPercent: 23, memoryGb: 4.2 }, services: [{ id: 'aqw-idle', state: 'online' }] })
  })
})
