import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceSummary, StreamMessage } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import type { ManagedSpec } from '../managed-services.js'
import type { HostTelemetry } from '../telemetry.js'
import { WorkspaceStore } from '../workspace-store.js'
import { buildTools } from './tools.js'

const summary = (id: string, actions: ServiceSummary['actions']): ServiceSummary => ({ id, name: id, mono: 'XX', desc: 'd', status: { state: 'online' }, actions, emitsEvents: false })

function setup(services: ServiceSummary[] = [], confirm = true) {
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const workspaces = new WorkspaceStore(new DatabaseSync(':memory:'))
  const sent: StreamMessage[] = []
  const others: StreamMessage[] = []
  screens.watch(screens.add((m) => sent.push(m)), 'default', 'tab-a')
  // Newer than the tab that is talking: the one a command used to go to.
  screens.watch(screens.add((m) => others.push(m)), 'default', 'tab-b')
  const ran: string[] = []
  const asked: unknown[][] = []
  const started: unknown[][] = []
  const managedSpecs = new Map<string, ManagedSpec>()
  const sentToAnywh: unknown[][] = []
  const announced: unknown[][] = []
  let resolveReply!: (r: { text: string; stopped: boolean; failed: boolean }) => void
  let rejectReply!: (e: Error) => void
  const replies = { promise: new Promise<{ text: string; stopped: boolean; failed: boolean }>((ok, fail) => ((resolveReply = ok), (rejectReply = fail))) }
  const anywh = {
    profiles: async () => [{ id: 'pessoal', label: 'pessoal', host: '127.0.0.1', port: 1 }],
    sessions: async (profile: string) => (profile === 'pessoal' ? [{ id: 's1', title: 'old', lastActiveAt: 1 }, { id: 's2', title: 'new', lastActiveAt: 2 }] : Promise.reject(new Error(`no anywh profile "${profile}"`))),
    read: async (...a: unknown[]) => `read ${a.join(' ')}`,
    send: async (...a: unknown[]) => (sentToAnywh.push(a), { session: (a[2] as { session?: string }).session ?? 'new-id', reply: replies.promise }),
  }
  const registry = {
    summaries: () => [...services, ...[...managedSpecs.values()].map((m) => ({ ...summary(m.id, []), name: m.name, managed: true }))],
    run: async (s: string, a: string) => (ran.push(`${s}/${a}`), { ms: 1, result: { ok: true } }),
    managed: {
      get: (id: string) => managedSpecs.get(id),
      upsert: async (spec: ManagedSpec) => void managedSpecs.set(spec.id, spec),
      remove: (id: string) => managedSpecs.delete(id),
    },
  } as unknown as Registry
  const existingContainers = ['baixa-baixa-1']
  const telemetry = { samples: () => [{ cpu: 23.4, mem: 4.2, temp: 55, net: 0 }], containers: () => [], memTotalGb: 15.3 } as unknown as HostTelemetry
  const tools = buildTools({ bus, registry, telemetry, workspaces, screens, tasks: { start: (...a: unknown[]) => (started.push(a), { id: 't1', title: String(a[1]), workspace: String(a[0]), state: 'running' as const }), stop: (id: string) => id === 't1', list: () => [] }, anywh, announce: (...a: unknown[]) => void announced.push(a), containers: async () => existingContainers.map((name) => ({ name, image: 'img', state: 'running', status: 'Up', ports: [] })), docker: { inspect: async (name: string) => (existingContainers.includes(name) ? { state: 'running', startedAt: '', image: 'img' } : undefined) }, approvals: { ask: async (...a: unknown[]) => (asked.push(a), confirm) }, hostName: () => 'box', currentWorkspace: () => 'default', currentScreen: () => 'tab-a' })
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.find((t) => t.name === name)
    if (!tool) throw new Error(`no tool ${name}`)
    return tool.handler(args)
  }
  const commands = () => sent.filter((m) => m.type === 'command').map((m) => (m as { command: unknown }).command)
  return { call, commands, bus, ran, tools, asked, started, managedSpecs, others, sentToAnywh, announced, resolveReply, rejectReply }
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

  it('shows what it does on the tab that asked, not the newest one', async () => {
    const { call, commands, others } = setup()
    await call('open_window', { window: 'telemetry' })
    expect(commands()).toEqual([{ name: 'open_window', window: 'telemetry' }])
    expect(others.filter((m) => m.type === 'command')).toEqual([])
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
    expect(JSON.parse(await call('list_workspaces'))).toEqual([{ id: 'default', name: 'Default', screens: 2 }])
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
    expect(started).toEqual([['default', 'Disk audit', 'Check the disks on both machines', 'tab-a']])
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

  describe('managing services', () => {
    it('lists the containers so NOX can find the one to add', async () => {
      const { call } = setup()
      expect(JSON.parse(await call('list_containers'))).toEqual([{ name: 'baixa-baixa-1', image: 'img', state: 'running', status: 'Up', ports: [] }])
    })

    it('adds a service on its own, checking the container exists, and logs it as NOX\'s doing', async () => {
      const { call, managedSpecs, bus } = setup()
      expect(await call('add_service', { id: 'baixa', name: 'Baixa', container: 'baixa-baixa-1', health_url: 'http://127.0.0.1:21832/', url: 'http://box:21832' })).toContain('Added "Baixa"')
      expect(managedSpecs.get('baixa')).toEqual({ id: 'baixa', name: 'Baixa', desc: '', container: 'baixa-baixa-1', healthUrl: 'http://127.0.0.1:21832/', url: 'http://box:21832' })
      expect(bus.recent().at(-1)).toMatchObject({ source: 'nox', message: 'added service baixa' })
    })

    it('refuses a bad spec, a missing container and an id that is taken, with a reason NOX can use', async () => {
      const { call } = setup([summary('aqw-idle', [])])
      await expect(call('add_service', { id: 'Bad Id', name: 'X' })).rejects.toThrow('kebab-case')
      await expect(call('add_service', { id: 'x', name: 'X', container: 'ghost' })).rejects.toThrow('list_containers')
      await expect(call('add_service', { id: 'aqw-idle', name: 'X' })).rejects.toThrow('already a service')
      await call('add_service', { id: 'x', name: 'X' })
      await expect(call('add_service', { id: 'x', name: 'X again' })).rejects.toThrow('edit_service')
    })

    it('edits only what is given, clears a field with null, and checks a new container', async () => {
      const { call, managedSpecs } = setup()
      await call('add_service', { id: 'baixa', name: 'Baixa', desc: 'old', container: 'baixa-baixa-1', url: 'http://box:1' })
      await call('edit_service', { id: 'baixa', desc: 'new', url: null })
      expect(managedSpecs.get('baixa')).toEqual({ id: 'baixa', name: 'Baixa', desc: 'new', container: 'baixa-baixa-1' })
      await expect(call('edit_service', { id: 'baixa', container: 'ghost' })).rejects.toThrow('no container named "ghost"')
      await expect(call('edit_service', { id: 'nope', name: 'X' })).rejects.toThrow('no managed service')
    })

    it('removes a managed service but not one made of code', async () => {
      const { call, managedSpecs } = setup([summary('aqw-idle', [])])
      await call('add_service', { id: 'x', name: 'X' })
      expect(await call('remove_service', { id: 'x' })).toContain('Removed')
      expect(managedSpecs.size).toBe(0)
      await expect(call('remove_service', { id: 'aqw-idle' })).rejects.toThrow('made of code')
      await expect(call('edit_service', { id: 'aqw-idle', name: 'X' })).rejects.toThrow('made of code')
      await expect(call('remove_service', { id: 'ghost' })).rejects.toThrow('no service')
    })

    it('runs any action by name, asking first when it changes something', async () => {
      const read = { id: 'status', method: 'GET' as const, path: '/status', title: 'Status', description: 'Reads', mutating: false }
      const write = { id: 'restart', method: 'POST' as const, path: '/restart', title: 'Restart', description: 'Restarts', mutating: true }
      const { call, ran, asked } = setup([summary('baixa', [read, write])])
      await call('call_service_action', { service: 'baixa', action: 'status' })
      expect(asked).toEqual([])
      await call('call_service_action', { service: 'baixa', action: 'restart' })
      expect(asked).toEqual([['default', 'Service action', { command: 'baixa: Restart' }]])
      expect(ran).toEqual(['baixa/status', 'baixa/restart'])
      await expect(call('call_service_action', { service: 'baixa', action: 'nope' })).rejects.toThrow('has no action "nope"')
      expect(JSON.parse(await call('describe_service', { id: 'baixa' })).actions.map((x: { id: string }) => x.id)).toEqual(['status', 'restart'])
    })

    it('does not run a mutating action the owner declines', async () => {
      const write = { id: 'restart', method: 'POST' as const, path: '/restart', title: 'Restart', description: 'Restarts', mutating: true }
      const { call, ran } = setup([summary('baixa', [write])], false)
      await expect(call('call_service_action', { service: 'baixa', action: 'restart' })).rejects.toThrow('did not confirm')
      expect(ran).toEqual([])
    })
  })

  it('summarises status for the model', async () => {
    const { call } = setup([summary('aqw-idle', [])])
    expect(JSON.parse(await call('get_status'))).toMatchObject({ host: 'box', telemetry: { cpuPercent: 23, memoryGb: 4.2 }, services: [{ id: 'aqw-idle', state: 'online' }] })
  })
  describe('anywh', () => {
    it('lists sessions newest first and reads with a default of ten turns', async () => {
      const { call } = setup()
      const listed = JSON.parse(await call('anywh_list_sessions', { profile: 'pessoal' }))
      expect(listed[0].sessions.map((s: { id: string }) => s.id)).toEqual(['s2', 's1'])
      expect(await call('anywh_read_session', { profile: 'pessoal', session: 's1' })).toBe('read pessoal s1 10')
      expect(await call('anywh_read_session', { profile: 'pessoal', session: 's1', turns: 500 })).toBe('read pessoal s1 50')
    })

    it('sends without asking, unless the task is destructive and the owner declines', async () => {
      const calm = setup()
      expect(await calm.call('anywh_send_message', { profile: 'pessoal', text: 'run the tests' })).toContain('new-id')
      expect(calm.asked).toHaveLength(0)

      const strict = setup([], false)
      await expect(strict.call('anywh_send_message', { profile: 'pessoal', text: 'rm -rf the cache', destructive: true })).rejects.toThrow('did not confirm')
      expect(strict.asked).toHaveLength(1)
      expect(strict.sentToAnywh).toHaveLength(0)
    })

    it('wakes NOX with the agent\'s last message when it finishes', async () => {
      const { call, announced, resolveReply } = setup()
      expect(await call('anywh_send_message', { profile: 'pessoal', text: 'run the tests', session: 's2' })).toContain('do not wait')
      expect(announced).toHaveLength(0)
      resolveReply({ text: 'All 12 tests pass.', stopped: false, failed: false })
      await vi.waitFor(() => expect(announced).toHaveLength(1))
      expect(String(announced[0][0])).toContain('[anywhere update]')
      expect(String(announced[0][0])).toContain('"new"')
      expect(String(announced[0][0])).toContain('All 12 tests pass.')
      expect(announced[0].slice(1)).toEqual(['default', 'tab-a'])
    })

    it('tells NOX when the agent was lost', async () => {
      const { call, announced, rejectReply } = setup()
      await call('anywh_send_message', { profile: 'pessoal', text: 'go' })
      rejectReply(new Error('the connection to the anywh relay was lost'))
      await vi.waitFor(() => expect(announced).toHaveLength(1))
      expect(String(announced[0][0])).toContain('lost track')
    })

    it('continues an existing session', async () => {
      const { call, sentToAnywh } = setup()
      expect(await call('anywh_send_message', { profile: 'pessoal', text: 'go on', session: 's1' })).toContain('s1')
      expect(sentToAnywh[0]).toEqual(['pessoal', 'go on', { session: 's1', cwd: undefined }])
    })
  })
})
