import type { FastifyPluginAsync } from 'fastify'
import type { ServiceManifest, ServiceStatus } from './index.js'

export type { FastifyInstance, FastifyPluginAsync } from 'fastify'
export type { ServiceFact, ServiceManifest, ServiceState, ServiceStatus } from './index.js'
export type { WebSocket } from '@fastify/websocket'

export interface ServerService {
  manifest: ServiceManifest
  // Mounted under /api/services/<id>, so a service never has to know its own prefix.
  routes?: FastifyPluginAsync
  // Polled by the dashboard, so keep it cheap or cache it. Defaults to { state: 'ok' }.
  status?: () => Promise<ServiceStatus>
}

export const defineServerService = (service: ServerService): ServerService => service
