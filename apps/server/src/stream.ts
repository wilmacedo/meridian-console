import { hostname } from 'node:os'
import type { FastifyInstance } from 'fastify'
import type { ClientMessage, HostInfo, StreamMessage } from '@meridian/service-sdk'
import type { EventBus } from './event-bus.js'
import type { Approvals } from './nox/approvals.js'
import type { Tasks } from './nox/tasks.js'
import type { ScreenRegistry } from './screens.js'
import { playbackDone } from './voice/playback.js'
import type { Registry } from './service-registry.js'
import type { HostTelemetry } from './telemetry.js'
import type { WorkspaceStore } from './workspace-store.js'

// A client that drops without a clean close (tab killed, laptop asleep) leaves a socket that looks
// open forever; ping it and terminate it if it doesn't answer.
const HEARTBEAT_MS = 30_000

export const hostName = (): string => process.env.MERIDIAN_HOST || hostname()

interface StreamSources {
  bus: EventBus
  registry: Registry
  telemetry: HostTelemetry
  workspaces: WorkspaceStore
  screens: ScreenRegistry
  approvals: Approvals
  tasks: Tasks
}

// One WebSocket carries everything live: the snapshot on connect, then events, service status
// changes and telemetry as they happen.
export function registerStream(app: FastifyInstance, { bus, registry, telemetry, workspaces, screens, approvals, tasks }: StreamSources): void {
  app.get('/api/stream', { websocket: true }, (socket) => {
    const send = (message: StreamMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
    }

    const host: HostInfo = { name: hostName(), memTotalGb: telemetry.memTotalGb }
    send({ type: 'snapshot', host, services: registry.summaries(), events: bus.recent(), telemetry: telemetry.samples(), containers: telemetry.containers() })

    const screenKey = screens.add(send)

    // A screen shows one workspace and only hears about that one.
    let watching: string | undefined
    const sendWorkspace = (id: string): void => {
      const w = workspaces.get(id)
      if (w) send({ type: 'workspace', id: w.id, version: w.version, state: w.state })
    }
    const sendTasks = (): void => {
      if (watching) send({ type: 'tasks', tasks: tasks.running(watching) })
    }
    socket.on('message', (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage
        if (message.type === 'watch') {
          watching = message.workspace
          screens.watch(screenKey, watching)
          sendWorkspace(watching)
          sendTasks()
        } else if (message.type === 'speech_done') {
          playbackDone(message.turn)
        } else if (message.type === 'approval_answer') {
          approvals.answer(message.id, message.allow === true, 'tapped')
        }
      } catch {
        // Not a message we know; ignore it.
      }
    })

    const stops = [
      workspaces.subscribe((w) => {
        if (w.id === watching) send({ type: 'workspace', id: w.id, version: w.version, state: w.state })
      }),
      tasks.subscribe(sendTasks),
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
      screens.remove(screenKey)
      clearInterval(heartbeat)
      for (const stop of stops) stop()
    })
  })
}
