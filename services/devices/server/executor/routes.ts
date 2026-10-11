import type { FastifyPluginAsync } from '@meridian/service-sdk/server'
import type { ExecutorGateway } from './gateway.js'
import type { Socket } from '../browser/gateway.js'

// The executor dials in here. There is no token to present: it proves it holds its private key in the handshake
// itself (see handshake.ts), and what it may do is decided by the owner approving it.
export const executorRoutes = (gateway: ExecutorGateway): FastifyPluginAsync => async (app) => {
  app.get('/executor', { websocket: true }, (socket) => gateway.attach(socket as unknown as Socket))
}
