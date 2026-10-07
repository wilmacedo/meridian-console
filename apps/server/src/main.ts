import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { openDatabase } from './database.js'
import { EventBus } from './event-bus.js'
import { registerServices } from './service-registry.js'
import { registerStream } from './stream.js'
import { HostTelemetry } from './telemetry.js'
import { registerWorkspaces } from './workspaces.js'
import { WorkspaceStore } from './workspace-store.js'

const app = Fastify({ logger: true })
const bus = new EventBus()
const telemetry = new HostTelemetry(app.log)
const workspaces = new WorkspaceStore(openDatabase())

await app.register(websocket)

app.get('/health', async () => ({ status: 'ok' }))

const registry = await registerServices(app, bus)
await telemetry.start()

app.get('/api/services', async () => registry.summaries())
app.get('/api/events', async () => bus.recent())
registerWorkspaces(app, workspaces)
registerStream(app, { bus, registry, telemetry, workspaces })

const port = Number(process.env.PORT ?? 4000)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
