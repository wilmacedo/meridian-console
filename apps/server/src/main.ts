import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { registerAqwIdlePacketStream } from './aqw-idle-packets.js'
import { registerFeeder } from './feeder.js'
import { registerFeederCamera } from './feeder-camera.js'

const app = Fastify({ logger: true })

await app.register(websocket)

app.get('/health', async () => ({ status: 'ok' }))

registerAqwIdlePacketStream(app)
registerFeederCamera(app)
registerFeeder(app)

const port = Number(process.env.PORT ?? 4000)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
