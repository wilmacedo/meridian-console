import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { openDatabase } from './database.js'
import { McpServer, registerMcp } from './nox/mcp.js'
import { Nox } from './nox/process.js'
import { Approvals, verdict } from './nox/approvals.js'
import { registerNox } from './nox/routes.js'
import { buildTools } from './nox/tools.js'
import { EventBus } from './event-bus.js'
import { ScreenRegistry } from './screens.js'
import { registerServices } from './service-registry.js'
import { hostName, registerStream } from './stream.js'
import { HostTelemetry } from './telemetry.js'
import { registerWorkspaces } from './workspaces.js'
import { WorkspaceStore } from './workspace-store.js'

const port = Number(process.env.PORT ?? 4000)
const app = Fastify({ logger: true })
const bus = new EventBus()
const telemetry = new HostTelemetry(app.log)
const workspaces = new WorkspaceStore(openDatabase())
const screens = new ScreenRegistry()

await app.register(websocket)

app.get('/health', async () => ({ status: 'ok' }))

const registry = await registerServices(app, bus)
await telemetry.start()

app.get('/api/services', async () => registry.summaries())
app.get('/api/events', async () => bus.recent())
registerWorkspaces(app, workspaces)

const approvals = new Approvals(screens, bus)
registerStream(app, { bus, registry, telemetry, workspaces, screens, approvals })

// NOX: its tools are served as an MCP server on this same process, and it answers whoever asks over
// /api/nox/say. While it answers, its tools act on the workspace of the screen that asked.
let turnWorkspace = 'default'
registerMcp(app, '/mcp', new McpServer('meridian', buildTools({ bus, registry, telemetry, workspaces, screens, approvals, hostName, currentWorkspace: () => turnWorkspace })))
// Claude Code asks this server before anything its classifier doesn't settle. It is a separate MCP
// server so that NOX, who only gets the Meridian one, can never approve its own actions.
registerMcp(
  app,
  '/mcp/gate',
  new McpServer('gate', [
    {
      name: 'approve',
      description: 'Asks the owner on the screen to confirm an action.',
      inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' } }, required: ['tool_name'] },
      handler: async (args) => verdict(await approvals.ask(turnWorkspace, String(args.tool_name), args.input), args.input),
    },
  ]),
)
const nox = new Nox(
  { port },
  { setWorkspace: (id) => (turnWorkspace = id), log: (message) => app.log.info(message) },
)
registerNox(app, { nox, bus, screens, registry, approvals })
app.addHook('onClose', async () => nox.stop())

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
