import { hostname } from 'node:os'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { EventBus } from './event-bus.js'
import { registerServices } from './service-registry.js'

const app = Fastify({ logger: true })
const bus = new EventBus()

await app.register(websocket)

app.get('/health', async () => ({ status: 'ok' }))

app.get('/api/host', async () => ({ name: process.env.MERIDIAN_HOST || hostname() }))

const registry = await registerServices(app, bus)

app.get('/api/services', async () => registry.summaries())
app.get('/api/events', async () => bus.recent())

const port = Number(process.env.PORT ?? 4000)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
