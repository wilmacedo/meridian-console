import { hostname } from 'node:os'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { registerServices } from './service-registry.js'

const app = Fastify({ logger: true })

await app.register(websocket)

app.get('/health', async () => ({ status: 'ok' }))

app.get('/api/host', async () => ({ name: process.env.MERIDIAN_HOST || hostname() }))

await registerServices(app)

const port = Number(process.env.PORT ?? 4000)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
