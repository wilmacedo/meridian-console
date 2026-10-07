import { renderTemplate, type DocBlock, type PaletteId, type ScreenCommand, type ThemeMode } from '@meridian/service-sdk'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import type { HostTelemetry } from '../telemetry.js'
import type { WorkspaceStore } from '../workspace-store.js'
import type { ContainerSummary, DockerApi } from '../docker.js'
import { validateSpec, type ManagedSpec } from '../managed-services.js'
import type { Approvals } from './approvals.js'
import type { Tasks } from './tasks.js'
import { validateDoc } from './doc-validation.js'
import type { McpTool } from './mcp.js'
import type { AnywhApi } from './anywh.js'

interface ToolDeps {
  bus: EventBus
  registry: Registry
  telemetry: HostTelemetry
  workspaces: WorkspaceStore
  screens: ScreenRegistry
  approvals: Pick<Approvals, 'ask'>
  tasks: Pick<Tasks, 'start' | 'stop' | 'list'>
  containers: () => Promise<ContainerSummary[]>
  docker: Pick<DockerApi, 'inspect'>
  anywh: AnywhApi
  // Starts a turn of NOX on its own, outside any request of the owner.
  announce: (text: string, workspace: string, screen?: string) => void
  hostName: () => string
  // The workspace of the screen NOX is answering; tools act there unless told otherwise.
  currentWorkspace: () => string
  // The tab that made the request being answered, when there is one.
  currentScreen: () => string | undefined
}

const MODULE_WINDOWS = ['services', 'telemetry', 'events', 'cameras'] as const
// The dock's Events button opens the window the screens call "logs".
const WINDOW_ID: Record<string, string> = { events: 'logs' }
const SERVICE_WINDOW = /^[a-z0-9-]+:[a-z0-9-]+$/
const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark']
const PALETTES: readonly PaletteId[] = ['mono', 'blue', 'meridian']
const MAX_RESULT_CHARS = 8000
const MIN_LIVE_SECONDS = 5
const MAX_LIVE_SECONDS = 3600
const DEFAULT_ANYWH_TURNS = 10
const MAX_ANYWH_TURNS = 50
const ANYWH_SESSIONS_SHOWN = 20
const MAX_ANYWH_REPLY_CHARS = 6000

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

const cut = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}… [truncated]` : s)

const clip = (s: string): string => cut(s, MAX_RESULT_CHARS)

export function buildTools(d: ToolDeps): McpTool[] {
  const workspaceOf = (args: Record<string, unknown>): string => {
    const id = text(args, 'workspace') ?? d.currentWorkspace()
    if (!d.workspaces.get(id)) throw new Error(`no workspace "${id}"; list_workspaces shows the ones that exist`)
    return id
  }

  // Asks the workspace's screen to do something, and logs it as NOX's doing.
  const command = (args: Record<string, unknown>, cmd: ScreenCommand, note: string): string => {
    const workspace = workspaceOf(args)
    // Only when NOX acts on the workspace it is talking in: another workspace has no "the screen that asked".
    const preferred = workspace === d.currentWorkspace() ? d.currentScreen() : undefined
    if (!d.screens.dispatch(workspace, cmd, preferred)) throw new Error(`no screen is showing workspace "${workspace}" right now`)
    d.bus.emit('nox', 'info', note)
    return `Done on workspace "${workspace}".`
  }

  // NOX speaks snake_case; the spec is camelCase. With `partial`, a field NOX did not send stays out and a null stays null.
  const specFrom = (a: Record<string, unknown>, partial = false): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const key of ['id', 'name', 'desc', 'mono', 'runtime', 'address', 'url', 'container']) if (a[key] !== undefined) out[key] = a[key]
    if (a.health_url !== undefined) out.healthUrl = a.health_url
    return partial ? out : Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null))
  }

  const mustExist = async (spec: ManagedSpec): Promise<void> => {
    if (spec.container && !(await d.docker.inspect(spec.container))) throw new Error(`no container named "${spec.container}"; list_containers shows the ones that exist`)
  }

  const statusOf = (id: string): string => {
    const status = d.registry.summaries().find((x) => x.id === id)?.status
    return status ? `Status: ${status.state}${status.message ? ` (${status.message})` : ''}.` : ''
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
      name: 'pin_live_widget',
      description:
        'Offers to dock a widget that keeps itself up to date: every few seconds a read-only service action runs and its result fills a block template. Use it for something the owner wants to keep an eye on. The template is a list of the same blocks compose_doc takes, with {{path}} placeholders that read the action result (dotted paths such as lastFeed.at or items.0.name); a string that is only one placeholder keeps its type, so {{percent}} works as a progress value. Call the matching service_* read tool first to see the shape of the result. Dynamic row lists are not supported, so use kv, stats or progress blocks. The owner drops the card on a rail; the action is run once now to check the template.',
      inputSchema: {
        type: 'object',
        required: ['service', 'action', 'title', 'template'],
        properties: {
          service: { type: 'string', description: 'Service id, for example "tuya-feeder".' },
          action: { type: 'string', description: 'A read-only action id of that service, for example "feeder-status".' },
          params: { type: 'object', description: 'Input for the action, when it takes any.' },
          every_seconds: { type: 'integer', minimum: MIN_LIVE_SECONDS, maximum: MAX_LIVE_SECONDS, description: 'How often to refresh. Default 30.' },
          title: { type: 'string' },
          kicker: { type: 'string', description: 'Small line above the title. Default "LIVE".' },
          template: { type: 'array', items: { type: 'object' } },
          workspace: workspaceProperty,
        },
      },
      handler: async (a) => {
        const service = d.registry.summaries().find((s) => s.id === text(a, 'service'))
        if (!service) throw new Error(`no service "${String(a.service)}"; get_status lists them`)
        const action = service.actions.find((x) => x.id === text(a, 'action'))
        if (!action) throw new Error(`service ${service.id} has no action "${String(a.action)}"; its actions are ${service.actions.map((x) => x.id).join(', ') || 'none'}`)
        if (action.mutating) throw new Error('a live widget re-runs its action on a timer, so only read-only actions can be bound')
        const params = a.params !== undefined && typeof a.params === 'object' && a.params !== null && !Array.isArray(a.params) ? (a.params as Record<string, unknown>) : undefined
        const title = text(a, 'title')
        if (!title) throw new Error('give a title')
        // Rendering the template with a real result now means a broken one fails here, where NOX can fix it.
        const sample = (await d.registry.run(service.id, action.id, action.input ? params : undefined)).result
        const checked = validateDoc({ title, blocks: renderTemplate(a.template, sample) })
        const every = typeof a.every_seconds === 'number' ? Math.round(a.every_seconds) : 30
        const widget = { title, kicker: text(a, 'kicker') ?? 'LIVE', service: service.id, action: action.id, params, everySec: Math.min(MAX_LIVE_SECONDS, Math.max(MIN_LIVE_SECONDS, every)), template: a.template as DocBlock[] }
        return command(a, { name: 'pin_live_widget', widget }, `offered a live widget "${title}" from ${service.id}/${action.id}`) + ` It shows ${checked.blocks.length} blocks and refreshes every ${widget.everySec} seconds.`
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
        properties: {
          id: { type: 'string', description: 'Makes the document live: composing again with the same id updates it in place instead of replacing it with a new one. Lowercase letters, digits and dashes.' },
          title: { type: 'string' },
          kicker: { type: 'string', description: 'Small line above the title, e.g. "Generated 12:04 · snapshot".' }, blocks: { type: 'array', items: { type: 'object' } },
          workspace: workspaceProperty,
        },
      },
      handler: (a) => {
        const doc = validateDoc({ id: a.id, title: a.title, kicker: a.kicker, blocks: a.blocks })
        return command(a, { name: 'compose_doc', doc }, `composed document "${doc.title}"`)
      },
    },
    {
      name: 'start_task',
      description:
        'Hands a long job to a background worker so you can keep talking: investigations across the machines, anything that takes more than a few seconds. The worker shows its progress in a live document on the screen and stops by itself. Describe the goal completely, because the worker cannot ask you anything. At most 2 run at once. After starting one, tell the owner in a short sentence that it is running and where to watch it.',
      inputSchema: {
        type: 'object',
        required: ['title', 'goal'],
        properties: { title: { type: 'string', description: 'Short, shown as the document title.' }, goal: { type: 'string', description: 'What to do and what the owner wants to know at the end.' }, workspace: workspaceProperty },
      },
      handler: (a) => {
        const title = text(a, 'title')
        const goal = text(a, 'goal')
        if (!title || !goal) throw new Error('give a title and a goal')
        const workspace = workspaceOf(a)
        const task = d.tasks.start(workspace, title, goal, workspace === d.currentWorkspace() ? d.currentScreen() : undefined)
        return `Task ${task.id} started. It reports in the document "task-${task.id}" on the screen.`
      },
    },
    {
      name: 'list_tasks',
      description: 'The background tasks started since the server came up, with their state (running, done, failed, stopped).',
      inputSchema: { type: 'object', properties: {} },
      handler: () => JSON.stringify(d.tasks.list()),
    },
    {
      name: 'stop_task',
      description: 'Stops a running background task.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      handler: (a) => (d.tasks.stop(text(a, 'id') ?? '') ? 'Stopped.' : 'No such running task.'),
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

  // Runs a service action. The ones that change something run only after the owner confirms the card.
  async function invoke(serviceId: string, actionId: string, a: Record<string, unknown> | undefined): Promise<string> {
    const service = d.registry.summaries().find((x) => x.id === serviceId)
    if (!service) throw new Error(`no service "${serviceId}"; get_status lists them`)
    const action = service.actions.find((x) => x.id === actionId)
    if (!action) throw new Error(`service ${service.id} has no action "${actionId}"; its actions are ${service.actions.map((x) => x.id).join(', ') || 'none'}`)
    const input = action.input ? a : undefined
    if (action.mutating) {
      const what = `${service.name}: ${action.title}${input && Object.keys(input).length ? ` ${JSON.stringify(input)}` : ''}`
      if (!(await d.approvals.ask(d.currentWorkspace(), 'Service action', { command: what }))) throw new Error('The owner did not confirm this, so it was not done.')
      d.bus.emit('nox', 'info', `ran ${service.id}/${action.id} after confirmation`)
    }
    return clip(JSON.stringify((await d.registry.run(service.id, action.id, input)).result ?? null))
  }

  // One tool per action for the services that exist when the server starts. A tool added later would not
  // reach NOX until its process restarts, which is what call_service_action is for.
  for (const service of d.registry.summaries()) {
    for (const action of service.actions) {
      tools.push({
        name: `service_${service.id}_${action.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
        description: `${service.name}: ${action.title}. ${action.description}${action.mutating ? ' Changes something, so the owner is asked to confirm on the screen first.' : ''}`,
        inputSchema: action.input ?? { type: 'object', properties: {} },
        handler: (a) => invoke(service.id, action.id, a),
      })
    }
  }

  tools.push(
    {
      name: 'describe_service',
      description: 'What a service is and what it can do: its details, whether it is managed (added from here) or made of code, and each action with its input.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      handler: (a) => {
        const service = d.registry.summaries().find((x) => x.id === text(a, 'id'))
        if (!service) throw new Error(`no service "${String(a.id)}"; get_status lists them`)
        return JSON.stringify({ ...service, actions: service.actions.map(({ id, title, description, mutating, input }) => ({ id, title, description, mutating, input })) })
      },
    },
    {
      name: 'call_service_action',
      description: 'Runs any action of any service, including services added while you are running (describe_service lists the actions). Read-only actions run at once; ones that change something ask the owner to confirm on the screen first.',
      inputSchema: {
        type: 'object',
        required: ['service', 'action'],
        properties: { service: { type: 'string' }, action: { type: 'string' }, input: { type: 'object', description: "The action's input, when it takes any." } },
      },
      handler: (a) => invoke(text(a, 'service') ?? '', text(a, 'action') ?? '', a.input !== null && typeof a.input === 'object' && !Array.isArray(a.input) ? (a.input as Record<string, unknown>) : {}),
    },
    {
      name: 'anywh_list_profiles',
      description: 'Lists the profiles of anywh, the app the owner uses to run coding agents (Claude Code, Codex) on this machine. Each profile is a separate agent login with its own sessions.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => JSON.stringify((await d.anywh.profiles()).map(({ id, label }) => ({ id, label }))),
    },
    {
      name: 'anywh_list_sessions',
      description: `Lists the anywh conversations (sessions) with id, title and last activity time in epoch milliseconds, newest first, the latest ${ANYWH_SESSIONS_SHOWN} per profile. Give a profile to list only its sessions; without one, every profile is listed.`,
      inputSchema: { type: 'object', properties: { profile: { type: 'string', description: 'Profile id from anywh_list_profiles.' } } },
      handler: async (a) => {
        const only = text(a, 'profile')
        const profiles = only ? [only] : (await d.anywh.profiles()).map((p) => p.id)
        const out = await Promise.all(profiles.map(async (profile) => ({ profile, sessions: (await d.anywh.sessions(profile)).sort((x, y) => y.lastActiveAt - x.lastActiveAt).slice(0, ANYWH_SESSIONS_SHOWN).map((s) => ({ ...s, title: s.title.slice(0, 120) })) })))
        return clip(JSON.stringify(out))
      },
    },
    {
      name: 'anywh_read_session',
      description: `Reads the most recent turns of an anywh session as plain text: what the owner asked, what the agent answered and which tools it ran. The last ${DEFAULT_ANYWH_TURNS} turns by default; ask for more only when the owner needs more context.`,
      inputSchema: {
        type: 'object',
        required: ['profile', 'session'],
        properties: { profile: { type: 'string' }, session: { type: 'string', description: 'Session id from anywh_list_sessions.' }, turns: { type: 'integer', description: `How many recent turns, up to ${MAX_ANYWH_TURNS}.` } },
      },
      handler: (a) => {
        const turns = typeof a.turns === 'number' ? Math.min(Math.max(Math.trunc(a.turns), 1), MAX_ANYWH_TURNS) : DEFAULT_ANYWH_TURNS
        return d.anywh.read(text(a, 'profile') ?? '', text(a, 'session') ?? '', turns)
      },
    },
    {
      name: 'anywh_send_message',
      description:
        'Sends a message to anywh: starts a new conversation in a profile, or, with a session id, continues an existing one. The agent then works on its own, on this machine. You do not wait: when it finishes you are woken with its last message to summarize for the owner. Set destructive to true when the task asks the agent to delete, overwrite, reset or otherwise destroy anything, so the owner confirms on the screen first.',
      inputSchema: {
        type: 'object',
        required: ['profile', 'text'],
        properties: {
          profile: { type: 'string' },
          text: { type: 'string', description: 'The message, written as the owner would write it to the agent.' },
          session: { type: 'string', description: 'An existing session to continue; omit to start a new conversation.' },
          cwd: { type: 'string', description: 'Working directory for a new conversation.' },
          destructive: { type: 'boolean', description: 'True when the task involves destroying or overwriting anything.' },
        },
      },
      handler: async (a) => {
        const profile = text(a, 'profile') ?? ''
        const message = text(a, 'text') ?? ''
        if (!message.trim()) throw new Error('text must not be empty')
        if (a.destructive === true && !(await d.approvals.ask(d.currentWorkspace(), 'anywh message', { command: `${profile}: ${message}` }))) throw new Error('The owner did not confirm this, so it was not sent.')
        const workspace = d.currentWorkspace()
        const screen = d.currentScreen()
        const { session, reply } = await d.anywh.send(profile, message, { session: text(a, 'session'), cwd: text(a, 'cwd') })
        d.bus.emit('nox', 'info', `sent a message to anywh ${profile}/${session}`)
        // The agent works on its own; when its turn ends NOX is woken with what it said, to tell the owner.
        const title = async (): Promise<string> => (await d.anywh.sessions(profile).catch(() => [])).find((x) => x.id === session)?.title.slice(0, 80) || 'a new conversation'
        reply.then(
          async (r) => d.announce(`[anywhere update] The agent in profile "${profile}" (session ${session}, "${await title()}") ${r.stopped ? 'was stopped' : r.failed ? 'failed' : 'finished'}. What it wrote last:\n\n${cut(r.text || '(nothing)', MAX_ANYWH_REPLY_CHARS)}`, workspace, screen),
          (err) => d.announce(`[anywhere update] I lost track of the agent in profile "${profile}" (session ${session}): ${err instanceof Error ? err.message : 'unknown error'}.`, workspace, screen),
        )
        return `Sent to session ${session}. You will be told when the agent finishes; do not wait for it.`
      },
    },
    {
      name: 'list_containers',
      description: 'Every Docker container on this machine, running or not, with its image, state and published ports. Use it to find the container of something the owner wants to add as a service.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => JSON.stringify(await d.containers()),
    },
    {
      name: 'add_service',
      description:
        'Adds a service to Meridian, live and without a restart: it shows up in the Services window and gets status, and for a container also logs and start, stop and restart (which ask the owner to confirm). Give it the Docker container (find it with list_containers) and/or a health_url that answers when the service is up. Use a url for the OPEN link on its card (the address the owner opens in a browser). Nothing is changed on the container itself.',
      inputSchema: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', description: 'Kebab-case and unique, for example "baixa".' },
          name: { type: 'string', description: 'Shown on the card.' },
          desc: { type: 'string', description: 'One line under the name.' },
          container: { type: 'string', description: 'Docker container name, as list_containers shows it.' },
          health_url: { type: 'string', description: 'http(s) URL fetched to see if it is up; any answer below 500 counts.' },
          url: { type: 'string', description: 'Opens in a new tab from the card.' },
          address: { type: 'string', description: 'host:port shown on the card.' },
          runtime: { type: 'string', description: 'Shown on the card; "docker" for a container by default.' },
          mono: { type: 'string', description: 'One or two letters for the card badge; derived from the name by default.' },
        },
      },
      handler: async (a) => {
        const spec = validateSpec(specFrom(a))
        if (d.registry.summaries().some((x) => x.id === spec.id)) throw new Error(`there is already a service "${spec.id}"; use edit_service to change a managed one`)
        await mustExist(spec)
        await d.registry.managed.upsert(spec)
        d.bus.emit('nox', 'info', `added service ${spec.id}`)
        return `Added "${spec.name}". ${statusOf(spec.id)}`
      },
    },
    {
      name: 'edit_service',
      description: 'Changes a service that was added with add_service: give its id and only the fields to change; null clears a field. Services made of code cannot be edited from here.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          desc: { type: 'string' },
          container: { type: ['string', 'null'] },
          health_url: { type: ['string', 'null'] },
          url: { type: ['string', 'null'] },
          address: { type: ['string', 'null'] },
          runtime: { type: ['string', 'null'] },
          mono: { type: ['string', 'null'] },
        },
      },
      handler: async (a) => {
        const id = text(a, 'id') ?? ''
        const existing = d.registry.managed.get(id)
        if (!existing) throw new Error(d.registry.summaries().some((x) => x.id === id) ? `"${id}" is a service made of code and cannot be edited from here` : `no managed service "${id}"; get_status lists the services`)
        const changes = specFrom(a, true)
        const merged = { ...existing, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) }
        for (const [k, v] of Object.entries(changes)) if (v === null) delete (merged as Record<string, unknown>)[k]
        const spec = validateSpec(merged)
        if (spec.container !== existing.container) await mustExist(spec)
        await d.registry.managed.upsert(spec)
        d.bus.emit('nox', 'info', `edited service ${id}`)
        return `Updated "${spec.name}". ${statusOf(id)}`
      },
    },
    {
      name: 'remove_service',
      description: 'Removes a service that was added with add_service from Meridian. The container or program it pointed at is not touched. Services made of code cannot be removed from here.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      handler: (a) => {
        const id = text(a, 'id') ?? ''
        if (!d.registry.managed.remove(id)) throw new Error(d.registry.summaries().some((x) => x.id === id) ? `"${id}" is a service made of code and cannot be removed from here` : `no service "${id}"`)
        d.bus.emit('nox', 'info', `removed service ${id}`)
        return `Removed "${id}" from Meridian.`
      },
    },
  )

  return tools
}
