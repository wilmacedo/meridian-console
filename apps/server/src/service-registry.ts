import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { ServiceActionInfo, ServiceStatus, ServiceSummary } from '@meridian/service-sdk'
import type { ActionContext, ServerService } from '@meridian/service-sdk/server'
import type { DockerApi } from './docker.js'
import type { EventBus } from './event-bus.js'
import { buildEndpointAction, buildManagedService, ID_PATTERN, type EndpointSpec, type ManagedServiceStore, type ManagedSpec } from './managed-services.js'

const SERVICES_DIR = process.env.SERVICES_DIR ?? fileURLToPath(new URL('../../../services', import.meta.url))
const STATUS_TIMEOUT_MS = 3000
const STATUS_POLL_MS = 10_000

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

// Whoever has no screen to ask on (a REST call, a timer) is told no to anything that needs the owner.
const NO_CONFIRMATION: ActionContext = { confirm: async () => false }

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
  // Services described as data, which can change while the server runs (the code ones cannot).
  managed: {
    list(): ManagedSpec[]
    get(id: string): ManagedSpec | undefined
    // Adds or replaces. Throws when the id belongs to a service made of code.
    upsert(spec: ManagedSpec): Promise<void>
    remove(id: string): boolean
  }
  // HTTP calls added to any service, code or managed, as extra actions.
  endpoints: {
    list(serviceId: string): EndpointSpec[]
    // Adds or replaces. Throws for an unknown service or an id that is one of the service's own actions.
    upsert(serviceId: string, spec: EndpointSpec): void
    remove(serviceId: string, id: string): boolean
  }
  // `ctx` is how the action may ask the owner to confirm; without one it is refused every time.
  run(serviceId: string, actionId: string, input: unknown, ctx?: ActionContext): Promise<{ ms: number; result: unknown }>
  // Fires when a service's status changes.
  onChange(listener: () => void): () => void
}

export async function registerServices(app: FastifyInstance, bus: EventBus, managed: { store: ManagedServiceStore; docker: DockerApi }): Promise<Registry> {
  const codeServices = await discover(app)
  const managedServices = new Map<string, ServerService>()
  const ownServices = (): ServerService[] => [...codeServices, ...managedServices.values()]
  // Each service with the endpoints added to it as further actions.
  const everyService = (): ServerService[] =>
    ownServices().map((service) => {
      const extra = managed.store.endpoints(service.manifest.id).map((e) => buildEndpointAction(e.spec))
      return extra.length ? { ...service, actions: [...(service.actions ?? []), ...extra] } : service
    })
  const statuses = new Map<string, ServiceStatus>()
  const listeners = new Set<() => void>()

  for (const service of codeServices) {
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

  // Reads one service's status and logs a change of state; true when something changed.
  async function check(service: ServerService): Promise<boolean> {
    const { id } = service.manifest
    const next = await readStatus(app, service)
    const prev = statuses.get(id)
    statuses.set(id, next)
    if (prev?.state === next.state && prev.message === next.message) return false
    if (prev && prev.state !== next.state) bus.emit(id, LEVEL_OF_STATE[next.state], `status ${prev.state} → ${next.state}${next.message ? ` · ${next.message}` : ''}`)
    return true
  }

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  async function poll(): Promise<void> {
    const changed = await Promise.all(everyService().map(check))
    if (changed.some(Boolean)) notify()
  }

  // Managed services are added after the server is listening, and Fastify takes no routes by then, so
  // their actions share one route that looks the action up when it is called. The routes of the code
  // services above are more specific and win.
  app.post<{ Params: { id: string; action: string } }>('/api/services/:id/actions/:action', async (request, reply) => {
    const { id, action } = request.params
    if (!everyService().some((s) => s.manifest.id === id && s.actions?.some((a) => a.id === action))) return reply.code(404).send({ ok: false, ms: 0, error: `no action "${id}/${action}"` })
    try {
      return { ok: true, ...(await run(id, action, request.body)) }
    } catch (err) {
      const { ms, error } = err instanceof ActionFailed ? err : { ms: 0, error: 'action failed' }
      return reply.code(500).send({ ok: false, ms, error })
    }
  })

  // Runs a service action and logs it to the event stream, whoever asked (a RUN button, NOX).
  async function run(serviceId: string, actionId: string, input: unknown, ctx: ActionContext = NO_CONFIRMATION): Promise<{ ms: number; result: unknown }> {
    const action = everyService().find((s) => s.manifest.id === serviceId)?.actions?.find((a) => a.id === actionId)
    if (!action) throw new ActionFailed(0, `no action "${serviceId}/${actionId}"`)
    const started = performance.now()
    const label = `${action.method} ${action.path}`
    try {
      const result = await (action.run as (input: unknown, ctx: ActionContext) => Promise<unknown>)(input, ctx)
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

  for (const spec of managed.store.list()) managedServices.set(spec.id, buildManagedService(spec, managed.docker))

  await poll()
  setInterval(poll, STATUS_POLL_MS).unref()

  const infoOf = (service: ServerService): ServiceActionInfo[] =>
    (service.actions ?? []).map(({ run: _run, ...info }) => info)

  return {
    run,
    endpoints: {
      list: (serviceId) => managed.store.endpoints(serviceId).map((e) => e.spec),
      upsert(serviceId, spec) {
        const service = ownServices().find((x) => x.manifest.id === serviceId)
        if (!service) throw new Error(`no service "${serviceId}"`)
        if (service.actions?.some((a) => a.id === spec.id)) throw new Error(`"${spec.id}" is already an action of ${serviceId} built into it; pick another id`)
        managed.store.putEndpoint(serviceId, spec)
        notify()
      },
      remove(serviceId, id) {
        const removed = managed.store.deleteEndpoint(serviceId, id)
        if (removed) notify()
        return removed
      },
    },
    managed: {
      list: () => managed.store.list(),
      get: (id) => managed.store.get(id),
      async upsert(spec) {
        if (codeServices.some((x) => x.manifest.id === spec.id)) throw new Error(`"${spec.id}" is a service made of code and cannot be changed from here`)
        managed.store.put(spec)
        const service = buildManagedService(spec, managed.docker)
        managedServices.set(spec.id, service)
        statuses.delete(spec.id)
        await check(service)
        notify()
      },
      remove(id) {
        if (!managedServices.delete(id)) return false
        managed.store.delete(id)
        statuses.delete(id)
        notify()
        return true
      },
    },
    summaries: () =>
      everyService().map((service) => ({
        ...service.manifest,
        mono: service.manifest.mono ?? monoOf(service.manifest.name),
        status: statuses.get(service.manifest.id) ?? { state: 'offline' },
        actions: infoOf(service),
        emitsEvents: service.events !== undefined,
        ...(managedServices.has(service.manifest.id) ? { managed: true } : {}),
      })),
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
