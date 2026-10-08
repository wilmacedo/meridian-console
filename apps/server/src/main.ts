import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { join } from 'node:path'
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
registerMcp(app, '/mcp', new McpServer('meridian', buildTools({ bus, registry, telemetry, workspaces, screens, approvals, tasks, containers: allContainers, docker, anywh: new Anywh(), messages, announce: (text, workspace, screen) => noxRoutes.announce(text, workspace, screen), hostName, currentWorkspace: () => turnWorkspace, currentScreen: () => turnScreen })))
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
const noxRoutes = registerNox(app, { nox, bus, screens, registry, approvals, messages, wakeDir: wakeDir() })
app.addHook('onClose', async () => nox.stop())

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
