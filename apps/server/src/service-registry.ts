import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { ServiceActionInfo, ServiceStatus, ServiceSummary } from '@meridian/service-sdk'
import type { ServerService } from '@meridian/service-sdk/server'
import type { EventBus } from './event-bus.js'

const SERVICES_DIR = process.env.SERVICES_DIR ?? fileURLToPath(new URL('../../../services', import.meta.url))
const STATUS_TIMEOUT_MS = 3000
const STATUS_POLL_MS = 10_000
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

// One broken service must not take the core down, so every failure here is logged and skipped.
async function discover(app: FastifyInstance): Promise<ServerService[]> {
  const found: ServerService[] = []

  for (const entry of await readdir(SERVICES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const entryFile = fileURLToPath(new URL(`${entry.name}/server/index.ts`, `${pathToFileURL(SERVICES_DIR)}/`))
    if (!(await exists(entryFile))) continue

    try {
      const service = ((await import(pathToFileURL(entryFile).href)) as { default?: ServerService }).default
      if (!service?.manifest) throw new Error('server/index.ts has no default export from defineServerService()')

      const { id } = service.manifest
      if (id !== entry.name) throw new Error(`manifest id "${id}" must match the folder name "${entry.name}"`)
      if (!ID_PATTERN.test(id)) throw new Error(`manifest id "${id}" must be kebab-case`)
      found.push(service)
    } catch (err) {
      app.log.error(err, `service "${entry.name}" failed to load, skipping it`)
    }
  }

  return found
}

async function readStatus(app: FastifyInstance, service: ServerService): Promise<ServiceStatus> {
  if (!service.status) return { state: 'online' }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      service.status(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('status check timed out')), STATUS_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    app.log.warn(err, `status check for "${service.manifest.id}" failed`)
    return { state: 'offline', message: 'status check failed' }
  } finally {
    clearTimeout(timer)
  }
}

const monoOf = (name: string): string => name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()

const LEVEL_OF_STATE = { online: 'info', degraded: 'warn', offline: 'error' } as const

export class ActionFailed extends Error {
  constructor(
    readonly ms: number,
    readonly error: string,
  ) {
    super(error)
  }
}

export interface Registry {
  summaries(): ServiceSummary[]
  run(serviceId: string, actionId: string, input: unknown): Promise<{ ms: number; result: unknown }>
  // Fires when a service's status changes.
  onChange(listener: () => void): () => void
}

export async function registerServices(app: FastifyInstance, bus: EventBus): Promise<Registry> {
  const services = await discover(app)
  const statuses = new Map<string, ServiceStatus>()
  const listeners = new Set<() => void>()

  for (const service of services) {
    const { id } = service.manifest
    if (service.routes) await app.register(service.routes, { prefix: `/api/services/${id}` })

    for (const action of service.actions ?? []) {
      app.post(`/api/services/${id}/actions/${action.id}`, { schema: action.input ? { body: action.input } : undefined }, async (request, reply) => {
        try {
          return { ok: true, ...(await run(id, action.id, request.body)) }
        } catch (err) {
          const { ms, error } = err instanceof ActionFailed ? err : { ms: 0, error: 'action failed' }
          return reply.code(500).send({ ok: false, ms, error })
        }
      })
    }

    // Events a service emits from here on live for as long as the server does.
    service.events?.((level, message) => bus.emit(id, level, message))
    app.log.info(`service "${id}" registered`)
  }

  async function poll(): Promise<void> {
    let changed = false
    await Promise.all(
      services.map(async (service) => {
        const { id } = service.manifest
        const next = await readStatus(app, service)
        const prev = statuses.get(id)
        statuses.set(id, next)
        if (prev?.state === next.state && prev.message === next.message) return
        changed = true
        if (prev && prev.state !== next.state) bus.emit(id, LEVEL_OF_STATE[next.state], `status ${prev.state} → ${next.state}${next.message ? ` · ${next.message}` : ''}`)
      }),
    )
    if (changed) for (const listener of listeners) listener()
  }

  // Runs a service action and logs it to the event stream, whoever asked (a RUN button, NOX).
  async function run(serviceId: string, actionId: string, input: unknown): Promise<{ ms: number; result: unknown }> {
    const action = services.find((s) => s.manifest.id === serviceId)?.actions?.find((a) => a.id === actionId)
    if (!action) throw new ActionFailed(0, `no action "${serviceId}/${actionId}"`)
    const started = performance.now()
    const label = `${action.method} ${action.path}`
    try {
      const result = await (action.run as (input: unknown) => Promise<unknown>)(input)
      const ms = Math.round(performance.now() - started)
      bus.emit(serviceId, 'info', `${label} 200 · ${ms}ms`)
      return { ms, result }
    } catch (err) {
      const ms = Math.round(performance.now() - started)
      app.log.error(err, `action "${serviceId}/${actionId}" failed`)
      bus.emit(serviceId, 'error', `${label} 500 · ${ms}ms`)
      throw new ActionFailed(ms, err instanceof Error ? err.message : 'action failed')
    }
  }

  await poll()
  setInterval(poll, STATUS_POLL_MS).unref()

  const infoOf = (service: ServerService): ServiceActionInfo[] =>
    (service.actions ?? []).map(({ run: _run, ...info }) => info)

  return {
    run,
    summaries: () =>
      services.map((service) => ({
        ...service.manifest,
        mono: service.manifest.mono ?? monoOf(service.manifest.name),
        status: statuses.get(service.manifest.id) ?? { state: 'offline' },
        actions: infoOf(service),
        emitsEvents: service.events !== undefined,
      })),
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
