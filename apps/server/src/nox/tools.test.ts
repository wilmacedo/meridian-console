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

function setup(services: ServiceSummary[] = [], confirm = true) {
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const workspaces = new WorkspaceStore(new DatabaseSync(':memory:'))
  const sent: StreamMessage[] = []
  screens.watch(screens.add((m) => sent.push(m)), 'default')
  const ran: string[] = []
  const asked: unknown[][] = []
  const started: unknown[][] = []
  const registry = { summaries: () => services, run: async (s: string, a: string) => (ran.push(`${s}/${a}`), { ms: 1, result: { ok: true } }) } as unknown as Registry
  const telemetry = { samples: () => [{ cpu: 23.4, mem: 4.2, temp: 55, net: 0 }], containers: () => [], memTotalGb: 15.3 } as unknown as HostTelemetry
  const tools = buildTools({ bus, registry, telemetry, workspaces, screens, tasks: { start: (...a: unknown[]) => (started.push(a), { id: 't1', title: String(a[1]), workspace: String(a[0]), state: 'running' as const }), stop: (id: string) => id === 't1', list: () => [] }, approvals: { ask: async (...a: unknown[]) => (asked.push(a), confirm) }, hostName: () => 'box', currentWorkspace: () => 'default' })
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.find((t) => t.name === name)
    if (!tool) throw new Error(`no tool ${name}`)
    return tool.handler(args)
  }
  const commands = () => sent.filter((m) => m.type === 'command').map((m) => (m as { command: unknown }).command)
  return { call, commands, bus, ran, tools, asked, started }
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
    await call('compose_doc', { id: 'task-1', title: 'T', blocks: [{ t: 'p', text: 'y' }] })
    expect(commands().at(-1)).toMatchObject({ name: 'compose_doc', doc: { id: 'task-1' } })
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

  describe('service actions', () => {
    const read = { id: 'status', method: 'GET' as const, path: '/status', title: 'Status', description: 'Reads', mutating: false }
    const write = { id: 'feed', method: 'POST' as const, path: '/feed', title: 'Feed', description: 'Dispenses', mutating: true }

    it('runs read-only actions without asking anyone', async () => {
      const { call, ran, asked } = setup([summary('pet-feeder', [read, write])])
      await call('service_pet-feeder_status')
      expect(ran).toEqual(['pet-feeder/status'])
      expect(asked).toEqual([])
    })

    it('runs a mutating action only after the owner confirms it, and logs it', async () => {
      const { call, ran, asked, bus } = setup([summary('pet-feeder', [read, write])])
      await call('service_pet-feeder_feed')
      expect(asked).toEqual([['default', 'Service action', { command: 'pet-feeder: Feed' }]])
      expect(ran).toEqual(['pet-feeder/feed'])
      expect(bus.recent().at(-1)?.message).toContain('pet-feeder/feed')
    })

    it('does nothing when the owner says no', async () => {
      const { call, ran } = setup([summary('pet-feeder', [read, write])], false)
      await expect(call('service_pet-feeder_feed')).rejects.toThrow('did not confirm')
      expect(ran).toEqual([])
    })
  })

  it('starts a background task on the current workspace and stops it by id', async () => {
    const { call, started } = setup()
    expect(await call('start_task', { title: 'Disk audit', goal: 'Check the disks on both machines' })).toContain('task-t1')
    expect(started).toEqual([['default', 'Disk audit', 'Check the disks on both machines']])
    await expect(call('start_task', { title: 'No goal' })).rejects.toThrow('give a title and a goal')
    expect(await call('stop_task', { id: 't1' })).toBe('Stopped.')
    expect(await call('stop_task', { id: 'nope' })).toBe('No such running task.')
  })

  describe('pin_live_widget', () => {
    const read = { id: 'status', method: 'GET' as const, path: '/status', title: 'Status', description: 'Reads', mutating: false }
    const write = { id: 'feed', method: 'POST' as const, path: '/feed', title: 'Feed', description: 'Dispenses', mutating: true }
    const base = { service: 'pet-feeder', action: 'status', title: 'Feeder', template: [{ t: 'kv', items: [{ k: 'OK', v: '{{ok}}' }] }] }

    it('checks the template against a real result, then offers the widget with its binding', async () => {
      const { call, commands, ran } = setup([summary('pet-feeder', [read, write])])
      expect(await call('pin_live_widget', { ...base, every_seconds: 2 })).toContain('refreshes every 5 seconds')
      expect(ran).toEqual(['pet-feeder/status'])
      expect(commands()).toEqual([
        { name: 'pin_live_widget', widget: { title: 'Feeder', kicker: 'LIVE', service: 'pet-feeder', action: 'status', everySec: 5, template: base.template } },
      ])
    })

    it('refuses mutating actions and unknown services or actions', async () => {
      const { call, ran } = setup([summary('pet-feeder', [read, write])])
      await expect(call('pin_live_widget', { ...base, action: 'feed' })).rejects.toThrow('only read-only')
      await expect(call('pin_live_widget', { ...base, action: 'nope' })).rejects.toThrow('has no action "nope"')
      await expect(call('pin_live_widget', { ...base, service: 'ghost' })).rejects.toThrow('no service "ghost"')
      expect(ran).toEqual([])
    })

    it('rejects a template that does not render into valid blocks', async () => {
      const { call, commands } = setup([summary('pet-feeder', [read])])
      await expect(call('pin_live_widget', { ...base, template: [{ t: 'progress', items: [{ label: 'X', value: '{{ok}}x' }] }] })).rejects.toThrow('value')
      expect(commands()).toEqual([])
    })
  })

  it('summarises status for the model', async () => {
    const { call } = setup([summary('aqw-idle', [])])
    expect(JSON.parse(await call('get_status'))).toMatchObject({ host: 'box', telemetry: { cpuPercent: 23, memoryGb: 4.2 }, services: [{ id: 'aqw-idle', state: 'online' }] })
  })
})
