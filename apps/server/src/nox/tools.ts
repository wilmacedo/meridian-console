import type { PaletteId, ScreenCommand, ThemeMode } from '@meridian/service-sdk'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import type { HostTelemetry } from '../telemetry.js'
import type { WorkspaceStore } from '../workspace-store.js'
import type { Approvals } from './approvals.js'
import { validateDoc } from './doc-validation.js'
import type { McpTool } from './mcp.js'

interface ToolDeps {
  bus: EventBus
  registry: Registry
  telemetry: HostTelemetry
  workspaces: WorkspaceStore
  screens: ScreenRegistry
  approvals: Pick<Approvals, 'ask'>
  hostName: () => string
  // The workspace of the screen NOX is answering; tools act there unless told otherwise.
  currentWorkspace: () => string
}

const MODULE_WINDOWS = ['services', 'telemetry', 'events', 'cameras'] as const
// The dock's Events button opens the window the screens call "logs".
const WINDOW_ID: Record<string, string> = { events: 'logs' }
const SERVICE_WINDOW = /^[a-z0-9-]+:[a-z0-9-]+$/
const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark']
const PALETTES: readonly PaletteId[] = ['mono', 'blue', 'meridian']
const MAX_RESULT_CHARS = 8000

const workspaceProperty = { type: 'string', description: 'Workspace id. Defaults to the workspace of the screen you are answering.' }
const windowProperty = {
  type: 'string',
  description: `One of ${MODULE_WINDOWS.join(', ')}, or a window a service contributes as "<service>:<window>", for example "aqw-idle:console".`,
}

const text = (args: Record<string, unknown>, key: string): string | undefined => {
  const v = args[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') throw new Error(`${key} must be a string`)
  return v
}

const windowArg = (args: Record<string, unknown>): string => {
  const w = text(args, 'window')
  if (w && ((MODULE_WINDOWS as readonly string[]).includes(w) || SERVICE_WINDOW.test(w))) return WINDOW_ID[w] ?? w
  throw new Error(`window must be one of ${MODULE_WINDOWS.join(', ')} or "<service>:<window>"`)
}

const clip = (s: string): string => (s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}… [truncated]` : s)

export function buildTools(d: ToolDeps): McpTool[] {
  const workspaceOf = (args: Record<string, unknown>): string => {
    const id = text(args, 'workspace') ?? d.currentWorkspace()
    if (!d.workspaces.get(id)) throw new Error(`no workspace "${id}"; list_workspaces shows the ones that exist`)
    return id
  }

  // Asks the workspace's screen to do something, and logs it as NOX's doing.
  const command = (args: Record<string, unknown>, cmd: ScreenCommand, note: string): string => {
    const workspace = workspaceOf(args)
    if (!d.screens.dispatch(workspace, cmd)) throw new Error(`no screen is showing workspace "${workspace}" right now`)
    d.bus.emit('nox', 'info', note)
    return `Done on workspace "${workspace}".`
  }

  const tools: McpTool[] = [
    {
      name: 'list_workspaces',
      description: 'Lists the workspaces (visual setups of the interface) and how many screens show each one right now.',
      inputSchema: { type: 'object', properties: {} },
      handler: () => {
        const counts = d.screens.counts()
        return JSON.stringify(d.workspaces.list().map((w) => ({ id: w.id, name: w.name, screens: counts[w.id] ?? 0 })))
      },
    },
    {
      name: 'open_window',
      description: 'Opens a window on the screen: services, telemetry, events or cameras, or a window a service contributes. At most 4 windows are open; opening a fifth closes the least recently used one.',
      inputSchema: { type: 'object', required: ['window'], properties: { window: windowProperty, workspace: workspaceProperty } },
      handler: (a) => command(a, { name: 'open_window', window: windowArg(a) }, `opened window ${windowArg(a)}`),
    },
    {
      name: 'close_window',
      description: 'Closes one window.',
      inputSchema: { type: 'object', required: ['window'], properties: { window: windowProperty, workspace: workspaceProperty } },
      handler: (a) => command(a, { name: 'close_window', window: windowArg(a) }, `closed window ${windowArg(a)}`),
    },
    {
      name: 'close_all_windows',
      description: 'Closes every window and returns to the core (the orb alone).',
      inputSchema: { type: 'object', properties: { workspace: workspaceProperty } },
      handler: (a) => command(a, { name: 'close_all' }, 'closed all windows'),
    },
    {
      name: 'arrange_windows',
      description: 'Tiles the open windows automatically.',
      inputSchema: { type: 'object', properties: { workspace: workspaceProperty } },
      handler: (a) => command(a, { name: 'arrange' }, 'arranged windows'),
    },
    {
      name: 'pin_widget',
      description: 'Offers to dock a window as a compact widget on the side. The user drags the card to the rail they want, so this only starts the pin; it does not dock anything by itself. An already docked system widget is highlighted instead.',
      inputSchema: { type: 'object', required: ['window'], properties: { window: { ...windowProperty, description: `${windowProperty.description} Use "doc" for the current document.` }, workspace: workspaceProperty } },
      handler: (a) => {
        const window = text(a, 'window') === 'doc' ? 'doc' : windowArg(a)
        return command(a, { name: 'pin_widget', window }, `offered to pin ${window}`)
      },
    },
    {
      name: 'clear_agent_widgets',
      description: 'Removes every widget you created from the docks. System widgets stay.',
      inputSchema: { type: 'object', properties: { workspace: workspaceProperty } },
      handler: (a) => command(a, { name: 'clear_agent_widgets' }, 'cleared agent widgets'),
    },
    {
      name: 'set_theme',
      description: 'Changes the look of the workspace. Mode is auto (light by day, dark at night), light or dark; Blue is always dark.',
      inputSchema: {
        type: 'object',
        properties: { mode: { type: 'string', enum: THEME_MODES }, palette: { type: 'string', enum: PALETTES }, workspace: workspaceProperty },
      },
      handler: (a) => {
        const mode = text(a, 'mode') as ThemeMode | undefined
        const palette = text(a, 'palette') as PaletteId | undefined
        if (!mode && !palette) throw new Error('give a mode, a palette or both')
        if (mode && !THEME_MODES.includes(mode)) throw new Error(`mode must be one of ${THEME_MODES.join(', ')}`)
        if (palette && !PALETTES.includes(palette)) throw new Error(`palette must be one of ${PALETTES.join(', ')}`)
        return command(a, { name: 'set_theme', mode, palette }, `set theme ${[mode, palette].filter(Boolean).join(' ')}`)
      },
    },
    {
      name: 'compose_doc',
      description:
        'Shows a document in a window, streamed in block by block. Use it when the answer is better seen than spoken: reports, tables, checklists. Blocks: {t:"h",level:1|2,text,eyebrow?}, {t:"p",text}, {t:"stats",items:[{label,value,unit?,note?,tone?}]}, {t:"progress",items:[{label,value 0-100,detail?,tone?}]}, {t:"table",cols:[{label,align?,w?}],rows:[[cell|{v,tone?}]]}, {t:"list",items:[{text,meta?,state:"done"|"active"|"todo"}]}, {t:"callout",tone?,title?,text}, {t:"kv",items:[{k,v,tone?}]}, {t:"code",lang?,text}, {t:"tags",items:[{label,tone?}]}, {t:"divider"}. Tones: ok, warn, bad, accent, fg, dim.',
      inputSchema: {
        type: 'object',
        required: ['title', 'blocks'],
        properties: { title: { type: 'string' }, kicker: { type: 'string', description: 'Small line above the title, e.g. "Generated 12:04 · snapshot".' }, blocks: { type: 'array', items: { type: 'object' } }, workspace: workspaceProperty },
      },
      handler: (a) => {
        const doc = validateDoc({ title: a.title, kicker: a.kicker, blocks: a.blocks })
        return command(a, { name: 'compose_doc', doc }, `composed document "${doc.title}"`)
      },
    },
    {
      name: 'get_status',
      description: 'Current state of the host and of every registered service.',
      inputSchema: { type: 'object', properties: {} },
      handler: () => {
        const sample = d.telemetry.samples().at(-1)
        return JSON.stringify({
          host: d.hostName(),
          telemetry: sample && { cpuPercent: Math.round(sample.cpu), memoryGb: Number(sample.mem.toFixed(1)), memoryTotalGb: Math.round(d.telemetry.memTotalGb), temperatureC: sample.temp && Math.round(sample.temp) },
          services: d.registry.summaries().map((s) => ({ id: s.id, name: s.name, description: s.desc, state: s.status.state, message: s.status.message })),
        })
      },
    },
    {
      name: 'query_events',
      description: 'Recent events from the unified log, newest first.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'A service id, "nox" or "core".' },
          level: { type: 'string', enum: ['info', 'warn', 'error'] },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
      handler: (a) => {
        const source = text(a, 'source')
        const level = text(a, 'level')
        const limit = typeof a.limit === 'number' ? Math.min(100, Math.max(1, Math.round(a.limit))) : 20
        const lines = d.bus
          .recent()
          .reverse()
          .filter((e) => (!source || e.source === source) && (!level || e.level === level))
          .slice(0, limit)
          .map((e) => `${e.ts} ${e.source} ${e.level.toUpperCase()} ${e.message}`)
        return lines.length ? lines.join('\n') : 'No matching events.'
      },
    },
    {
      name: 'get_telemetry',
      description: 'Host load right now (CPU, memory, temperature, network) and the Docker containers with their CPU and memory.',
      inputSchema: { type: 'object', properties: {} },
      handler: () => JSON.stringify({ sample: d.telemetry.samples().at(-1) ?? null, memoryTotalGb: Number(d.telemetry.memTotalGb.toFixed(1)), containers: d.telemetry.containers() }),
    },
  ]

  // Service actions. The ones that change something run only after the owner confirms the card.
  for (const service of d.registry.summaries()) {
    for (const action of service.actions) {
      tools.push({
        name: `service_${service.id}_${action.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
        description: `${service.name}: ${action.title}. ${action.description}${action.mutating ? ' Changes something, so the owner is asked to confirm on the screen first.' : ''}`,
        inputSchema: action.input ?? { type: 'object', properties: {} },
        handler: async (a) => {
          const input = action.input ? a : undefined
          if (action.mutating) {
            const what = `${service.name}: ${action.title}${input && Object.keys(input).length ? ` ${JSON.stringify(input)}` : ''}`
            if (!(await d.approvals.ask(d.currentWorkspace(), 'Service action', { command: what }))) throw new Error('The owner did not confirm this, so it was not done.')
            d.bus.emit('nox', 'info', `ran ${service.id}/${action.id} after confirmation`)
          }
          return clip(JSON.stringify((await d.registry.run(service.id, action.id, input)).result ?? null))
        },
      })
    }
  }

  return tools
}
