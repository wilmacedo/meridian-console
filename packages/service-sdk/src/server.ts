import type { FastifyPluginAsync } from 'fastify'
import type { EventLevel, ServiceActionInfo, ServiceManifest, ServiceStatus } from './index.js'

export type { FastifyInstance, FastifyPluginAsync } from 'fastify'
export type { EventLevel, ServiceActionInfo, ServiceManifest, ServiceState, ServiceStatus } from './index.js'
export type { WebSocket } from '@fastify/websocket'

// An operation the service exposes. The same list feeds the RUN buttons in the Services window and
// NOX's tools.
export interface ServiceAction<Input = never> extends ServiceActionInfo {
  run: (input: Input) => Promise<unknown>
}

export type Emit = (level: EventLevel, message: string) => void

export interface ServerService {
  manifest: ServiceManifest
  // Mounted under /api/services/<id>, so a service never has to know its own prefix.
  routes?: FastifyPluginAsync
  // Polled by the core, so keep it cheap or cache it. Defaults to { state: 'online' }.
  status?: () => Promise<ServiceStatus>
  actions?: ServiceAction<never>[]
  // Starts emitting events into the core's stream; returns the function that stops them.
  events?: (emit: Emit) => () => void
}

export const defineServerService = (service: ServerService): ServerService => service
