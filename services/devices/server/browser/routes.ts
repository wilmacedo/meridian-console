import type { FastifyPluginAsync } from '@meridian/service-sdk/server'
import type { Device, DeviceStore } from '../store.js'
import { authorize, RateLimiter } from './authorize.js'
import type { BrowserGateway, Socket } from './gateway.js'
import { AUTH_SUBPROTOCOL_PREFIX } from './protocol.js'

// The device behind an upgrade request, found before the upgrade so a stranger never gets a socket.
export function deviceOf(store: DeviceStore, origin: string | undefined, subprotocols: string | undefined): Device | undefined {
  // A browser-shaped Origin is never authorization on its own, only a first filter.
  if (!origin?.startsWith('chrome-extension://')) return undefined
  const offered = (subprotocols ?? '').split(',').map((s) => s.trim()).filter((s) => s.startsWith(AUTH_SUBPROTOCOL_PREFIX))
  if (offered.length !== 1) return undefined
  return store.deviceByToken(offered[0].slice(AUTH_SUBPROTOCOL_PREFIX.length))
}

// Mounted under /api/services/devices: `extension` is the WebSocket and `extension/authorize` the pairing exchange,
// the two URLs the BrowserSkill extension derives from the pairing link.
export const browserRoutes = (store: DeviceStore, gateway: BrowserGateway, limiter = new RateLimiter()): FastifyPluginAsync => async (app) => {
  const devices = new WeakMap<object, Device>()

  app.post('/extension/authorize', async (req, reply) => {
    const out = authorize(store, limiter, req.ip, req.headers.authorization, req.body)
    reply.header('Cache-Control', 'no-store')
    if (out.retryAfter) reply.header('Retry-After', out.retryAfter)
    return reply.code(out.status).send(out.body)
  })

  app.get(
    '/extension',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const device = deviceOf(store, req.headers.origin, req.headers['sec-websocket-protocol'])
        if (!device) return reply.code(401).send({ error: 'unauthorized' })
        devices.set(req, device)
      },
    },
    (socket, req) => gateway.attach(socket as unknown as Socket, devices.get(req)!),
  )
}
