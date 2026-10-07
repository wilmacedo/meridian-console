import { hostname } from 'node:os'
import type { FastifyInstance } from 'fastify'
import type { HostInfo, StreamMessage } from '@meridian/service-sdk'
import type { EventBus } from './event-bus.js'
import type { Registry } from './service-registry.js'
import type { HostTelemetry } from './telemetry.js'

// A client that drops without a clean close (tab killed, laptop asleep) leaves a socket that looks
// open forever; ping it and terminate it if it doesn't answer.
const HEARTBEAT_MS = 30_000

export const hostName = (): string => process.env.MERIDIAN_HOST || hostname()

interface StreamSources {
  bus: EventBus
  registry: Registry
  telemetry: HostTelemetry
}

// One WebSocket carries everything live: the snapshot on connect, then events, service status
// changes and telemetry as they happen.
export function registerStream(app: FastifyInstance, { bus, registry, telemetry }: StreamSources): void {
  app.get('/api/stream', { websocket: true }, (socket) => {
    const send = (message: StreamMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
    }

    const host: HostInfo = { name: hostName(), memTotalGb: telemetry.memTotalGb }
    send({ type: 'snapshot', host, services: registry.summaries(), events: bus.recent(), telemetry: telemetry.samples(), containers: telemetry.containers() })

    const stops = [
      bus.subscribe((event) => send({ type: 'event', event })),
      registry.onChange(() => send({ type: 'services', services: registry.summaries() })),
      telemetry.subscribe((sample, containers) => send({ type: 'telemetry', sample, containers })),
    ]

    let alive = true
    socket.on('pong', () => (alive = true))
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate()
      alive = false
      socket.ping()
    }, HEARTBEAT_MS)

    socket.on('close', () => {
      clearInterval(heartbeat)
      for (const stop of stops) stop()
    })
  })
}
