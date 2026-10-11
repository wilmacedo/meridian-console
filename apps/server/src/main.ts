import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { join } from 'node:path'
import { clockNote, routineHint } from './agenda/match.js'
import { Reminders, review } from './agenda/reminders.js'
import { routineTools } from './agenda/routine-tools.js'
import { RoutineStore } from './agenda/routines.js'
import { RoutineRunner } from './agenda/runner.js'
import { profileTools } from './agenda/profile-tools.js'
import { ProfileReader, readerDir } from './agenda/profiles.js'
import { todoTools } from './agenda/todo-tools.js'
import { AgendaSettings, TodoStore } from './agenda/todos.js'
import { dataDir, openDatabase } from './database.js'
import { allContainers, docker } from './docker.js'
import { ManagedServiceStore } from './managed-services.js'
import { McpServer, registerMcp } from './nox/mcp.js'
import { Approvals, verdict } from './nox/approvals.js'
import { Nox, noxHome } from './nox/process.js'
import { registerNox } from './nox/routes.js'
import { WakeArbiter } from './voice/wake-arbiter.js'
import { registerWakeWord, wakeDir } from './voice/wake-word.js'
import { Tasks } from './nox/tasks.js'
import { buildTools } from './nox/tools.js'
import { Anywh } from './nox/anywh.js'
import { VoiceMessages } from './voice/voice-messages.js'
import { EventBus } from './event-bus.js'
import { ScreenRegistry } from './screens.js'
import { registerServices } from './service-registry.js'
import { hostName, registerStream } from './stream.js'
import { HostTelemetry } from './telemetry.js'
import { defaultWebRoot, registerWebApp } from './web-app.js'
import { registerWorkspaces } from './workspaces.js'
import { WorkspaceStore } from './workspace-store.js'

const port = Number(process.env.PORT ?? 4000)
const app = Fastify({ logger: true })
const bus = new EventBus()
const telemetry = new HostTelemetry(app.log)
const db = openDatabase()
const workspaces = new WorkspaceStore(db)
const screens = new ScreenRegistry()
const messages = new VoiceMessages(join(dataDir(), 'recordings'))

await app.register(websocket)

app.get('/health', async () => ({ status: 'ok' }))

const registry = await registerServices(app, bus, { store: new ManagedServiceStore(db), docker })
await telemetry.start()

app.get('/api/services', async () => registry.summaries())
app.get('/api/events', async () => bus.recent())
registerWorkspaces(app, workspaces)

const approvals = new Approvals(screens, bus)
const tasks = new Tasks({ port, home: noxHome(), model: process.env.NOX_MODEL ?? 'sonnet', bus, screens })
app.addHook('onClose', async () => tasks.stopAll())
registerStream(app, { bus, registry, telemetry, workspaces, screens, approvals, tasks, wake: new WakeArbiter(), onInterrupt: () => noxRoutes.interrupt() })
registerWakeWord(app, wakeDir())
// The latest version of a live document, for a screen that wasn't there when NOX composed it.
app.get<{ Params: { id: string } }>('/api/docs/:id', async (request, reply) => screens.doc(request.params.id) ?? reply.code(404).send({ error: 'no such document' }))

// NOX: its tools are served as an MCP server on this same process, and it answers whoever asks over
// /api/nox/say. While it answers, its tools act on the workspace of the screen that asked.
let turnWorkspace = 'default'
// The tab that spoke: what NOX shows and says for the request goes to it, not to whichever tab is newest.
let turnScreen: string | undefined
const announce = (text: string, workspace: string, screen?: string): void => noxRoutes.announce(text, workspace, screen)
// The owner's routines: started only by the owner, by phrase or by name, and run as background tasks.
const routines = new RoutineStore(db)
const todos = new TodoStore(db)
const agendaSettings = new AgendaSettings(db)
// The owner's Claude Code logins, read with when a routine or the owner asks for their mail or Slack.
const reader = new ProfileReader(readerDir(dataDir()), { model: process.env.NOX_MODEL ?? 'sonnet' })
const runner = new RoutineRunner({ store: routines, registry, tasks, screens, bus, announce, review: () => review(todos.list('open'), Date.now()) })
registerMcp(
  app,
  '/mcp',
  new McpServer('meridian', [
    ...buildTools({ bus, registry, telemetry, workspaces, screens, approvals, tasks, containers: allContainers, docker, anywh: new Anywh(), messages, announce, conversations: () => noxRoutes.conversations, hostName, currentWorkspace: () => turnWorkspace, currentScreen: () => turnScreen }),
    ...routineTools({ store: routines, profiles: async () => (await reader.profiles()).map((p) => p.id), runner, registry, screens, bus, currentWorkspace: () => turnWorkspace, currentScreen: () => turnScreen }),
    ...todoTools({ todos, settings: agendaSettings, registry, bus }),
    ...profileTools({ reader, bus }),
  ]),
)
// Claude Code asks this server before anything its classifier doesn't settle. It is a separate MCP
// server so that NOX, who only gets the Meridian one, can never approve its own actions. NOX's turns
// ask on the workspace being answered; a background task has its own URL naming the workspace it serves.
const gate = (workspace: () => string, scope: 'turn' | 'task'): McpServer =>
  new McpServer('gate', [
    {
      name: 'approve',
      description: 'Asks the owner on the screen to confirm an action.',
      inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' } }, required: ['tool_name'] },
      handler: async (args) => verdict(await approvals.ask(workspace(), String(args.tool_name), args.input, scope), args.input),
    },
  ])
registerMcp(app, '/mcp/gate', gate(() => turnWorkspace, 'turn'))
registerMcp(app, '/mcp/gate/:workspace', (params) => gate(() => params.workspace, 'task'))
const nox = new Nox(
  { port },
  { setTurn: (workspace, screen) => ((turnWorkspace = workspace), (turnScreen = screen)), log: (message) => app.log.info(message) },
)
const noxRoutes = registerNox(app, {
  nox,
  bus,
  screens,
  registry,
  approvals,
  messages,
  wakeDir: wakeDir(),
  hint: (text) => {
    const now = new Date()
    return [clockNote(now), routineHint(text, routines.list(), (id) => routines.lastRun(id)?.startedAt, now)].filter(Boolean).join(' ')
  },
})
app.addHook('onClose', async () => nox.stop())

// The owner's reminders, delivered at the moments they set. A workspace is in the car when its CarPlay switch is
// on, which it is by default for the one called "carplay".
const reminders = new Reminders({
  todos,
  settings: agendaSettings,
  registry,
  screens,
  bus,
  announce,
  lastScreen: () => noxRoutes.lastScreen(),
  inCar: (id) => ((workspaces.get(id)?.state as { carplay?: boolean } | undefined)?.carplay ?? id === 'carplay'),
})
reminders.start()
app.addHook('onClose', async () => reminders.stop())

if (await registerWebApp(app, defaultWebRoot())) app.log.info(`serving the web app from ${defaultWebRoot()}`)
else app.log.info('no web build found (pnpm build); the Vite dev server serves the app')

// A failure nobody was waiting for (a voice request that failed after its turn ended, say) is logged, not
// allowed to take the whole server, and every screen with it, down.
process.on('unhandledRejection', (reason) => app.log.error(reason, 'unhandled rejection'))

// Loopback only: NOX has a shell on this machine and Meridian has no login, so the only way in from another
// device is `tailscale serve` (docs/https.md), which reaches this port from the machine itself.
app.listen({ port, host: '127.0.0.1' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
