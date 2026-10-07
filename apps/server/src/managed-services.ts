import type { DatabaseSync } from 'node:sqlite'
import type { ServiceManifest, ServiceState, ServiceStatus } from '@meridian/service-sdk'
import type { ServerService } from '@meridian/service-sdk/server'
import { CONTAINER_NAME, type DockerApi } from './docker.js'

// A service described as data instead of code: NOX can add, change and remove one while the server runs,
// where a code service is a folder that is only read at startup. What it can do is fixed here: watch a
// Docker container and/or an HTTP address, read a container's logs, and start, stop or restart it.
export interface ManagedSpec {
  id: string
  name: string
  desc: string
  mono?: string
  runtime?: string
  address?: string
  url?: string
  container?: string
  // GET this URL: any answer below 500 means the service is up.
  healthUrl?: string
}

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const FIELDS = ['id', 'name', 'desc', 'mono', 'runtime', 'address', 'url', 'container', 'healthUrl'] as const

const fail = (message: string): never => {
  throw new Error(message)
}

function text(raw: Record<string, unknown>, key: string, max: number, required = false): string | undefined {
  const v = raw[key]
  if (v === undefined || v === null || v === '') return required ? fail(`${key} is required`) : undefined
  if (typeof v !== 'string') return fail(`${key} must be a string`)
  return v.length <= max ? v : fail(`${key} is longer than ${max} characters`)
}

function httpUrl(raw: Record<string, unknown>, key: string): string | undefined {
  const v = text(raw, key, 300)
  if (v === undefined) return undefined
  try {
    if (!['http:', 'https:'].includes(new URL(v).protocol)) throw new Error()
  } catch {
    fail(`${key} must be an http or https URL`)
  }
  return v
}

// Checks what NOX (or anyone) sent and returns it without undefined keys. The message of a thrown error is
// what NOX reads to fix its call.
export function validateSpec(raw: unknown): ManagedSpec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('expected an object')
  const r = raw as Record<string, unknown>
  const unknown = Object.keys(r).filter((k) => !(FIELDS as readonly string[]).includes(k))
  if (unknown.length) fail(`unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)

  const id = text(r, 'id', 40, true)!
  if (!ID_PATTERN.test(id)) fail('id must be kebab-case: lowercase letters and digits separated by single dashes')
  const mono = text(r, 'mono', 2)
  if (mono !== undefined && !/^[a-zA-Z0-9]{1,2}$/.test(mono)) fail('mono must be one or two letters or digits')
  const container = text(r, 'container', 100)
  if (container !== undefined && !CONTAINER_NAME.test(container)) fail('container is not a valid Docker container name')

  const spec: ManagedSpec = {
    id,
    name: text(r, 'name', 40, true)!,
    desc: text(r, 'desc', 120) ?? '',
    mono: mono?.toUpperCase(),
    runtime: text(r, 'runtime', 20),
    address: text(r, 'address', 60),
    url: httpUrl(r, 'url'),
    container,
    healthUrl: httpUrl(r, 'healthUrl'),
  }
  return JSON.parse(JSON.stringify(spec)) as ManagedSpec
}

// An HTTP call the owner (or NOX) taught Meridian about a service: it becomes one more action of that service,
// code or managed alike, so a service does not have to be edited and restarted to grow an endpoint.
export interface EndpointSpec {
  id: string
  title: string
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  // Defaults to everything but GET.
  mutating: boolean
  // JSON Schema of what the action takes: query parameters for a GET, the JSON body otherwise.
  input?: Record<string, unknown>
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export function validateEndpoint(raw: unknown): EndpointSpec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('expected an object')
  const r = raw as Record<string, unknown>
  const allowed = ['id', 'title', 'description', 'method', 'url', 'mutating', 'input']
  const unknown = Object.keys(r).filter((k) => !allowed.includes(k))
  if (unknown.length) fail(`unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)
  const id = text(r, 'id', 40, true)!
  if (!ID_PATTERN.test(id)) fail('id must be kebab-case: lowercase letters and digits separated by single dashes')
  const method = (text(r, 'method', 10) ?? 'GET').toUpperCase()
  if (!(METHODS as readonly string[]).includes(method)) fail(`method must be one of ${METHODS.join(', ')}`)
  if (r.mutating !== undefined && typeof r.mutating !== 'boolean') fail('mutating must be true or false')
  if (r.input !== undefined && (typeof r.input !== 'object' || r.input === null || Array.isArray(r.input))) fail('input must be a JSON Schema object')
  return JSON.parse(
    JSON.stringify({
      id,
      title: text(r, 'title', 40, true),
      description: text(r, 'description', 200) ?? '',
      method,
      url: httpUrl({ url: text(r, 'url', 300, true) }, 'url'),
      mutating: r.mutating ?? method !== 'GET',
      input: r.input,
    }),
  ) as EndpointSpec
}

const CALL_TIMEOUT_MS = 30_000

// The action an endpoint adds to its service.
export function buildEndpointAction(spec: EndpointSpec): NonNullable<ServerService['actions']>[number] {
  return {
    id: spec.id,
    method: spec.method === 'GET' ? 'GET' : 'POST',
    path: `/${spec.id}`,
    title: spec.title,
    description: spec.description,
    mutating: spec.mutating,
    ...(spec.input ? { input: spec.input as never } : {}),
    run: async (input: Record<string, unknown> | undefined) => {
      const url = new URL(spec.url)
      const init: RequestInit = { method: spec.method, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }
      if (spec.method === 'GET') for (const [k, v] of Object.entries(input ?? {})) url.searchParams.set(k, String(v))
      else if (input && Object.keys(input).length) Object.assign(init, { body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } })
      const res = await fetch(url, init)
      const body = await res.text()
      if (!res.ok) throw new Error(`${spec.method} ${url.pathname} responded ${res.status}: ${body.slice(0, 300)}`)
      try {
        return JSON.parse(body)
      } catch {
        return body.slice(0, 4000)
      }
    },
  } as never
}

export class ManagedServiceStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS managed_services (
      id TEXT PRIMARY KEY,
      spec TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS service_endpoints (
      service_id TEXT NOT NULL,
      id TEXT NOT NULL,
      spec TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (service_id, id)
    )`)
  }

  endpoints(serviceId?: string): { serviceId: string; spec: EndpointSpec }[] {
    const rows = (serviceId === undefined
      ? this.db.prepare('SELECT service_id, spec FROM service_endpoints ORDER BY service_id, id').all()
      : this.db.prepare('SELECT service_id, spec FROM service_endpoints WHERE service_id = ? ORDER BY id').all(serviceId)) as { service_id: string; spec: string }[]
    return rows.map((r) => ({ serviceId: r.service_id, spec: JSON.parse(r.spec) as EndpointSpec }))
  }

  putEndpoint(serviceId: string, spec: EndpointSpec): void {
    this.db
      .prepare('INSERT INTO service_endpoints (service_id, id, spec, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(service_id, id) DO UPDATE SET spec = excluded.spec, updated_at = excluded.updated_at')
      .run(serviceId, spec.id, JSON.stringify(spec), new Date().toISOString())
  }

  deleteEndpoint(serviceId: string, id: string): boolean {
    return Number(this.db.prepare('DELETE FROM service_endpoints WHERE service_id = ? AND id = ?').run(serviceId, id).changes) > 0
  }

  list(): ManagedSpec[] {
    return (this.db.prepare('SELECT spec FROM managed_services ORDER BY id').all() as { spec: string }[]).map((r) => JSON.parse(r.spec) as ManagedSpec)
  }

  get(id: string): ManagedSpec | undefined {
    const row = this.db.prepare('SELECT spec FROM managed_services WHERE id = ?').get(id) as { spec: string } | undefined
    return row && (JSON.parse(row.spec) as ManagedSpec)
  }

  put(spec: ManagedSpec): void {
    this.db
      .prepare('INSERT INTO managed_services (id, spec, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET spec = excluded.spec, updated_at = excluded.updated_at')
      .run(spec.id, JSON.stringify(spec), new Date().toISOString())
  }

  delete(id: string): boolean {
    this.db.prepare('DELETE FROM service_endpoints WHERE service_id = ?').run(id)
    return Number(this.db.prepare('DELETE FROM managed_services WHERE id = ?').run(id).changes) > 0
  }
}

const PROBE_TIMEOUT_MS = 2500
const MAX_LOG_LINES = 200
const DEFAULT_LOG_LINES = 50

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'manual' })
    return res.status < 500
  } catch {
    return false
  }
}

// The running service a spec describes. Its status comes from the container and the health URL; its
// actions are the ones that make sense for a container.
export function buildManagedService(spec: ManagedSpec, docker: DockerApi): ServerService {
  const { container, healthUrl } = spec
  const manifest: ServiceManifest = {
    id: spec.id,
    name: spec.name,
    desc: spec.desc,
    mono: spec.mono,
    runtime: spec.runtime ?? (container ? 'docker' : 'external'),
    address: spec.address,
    container,
    url: spec.url,
  }

  const status = async (): Promise<ServiceStatus> => {
    let state: ServiceState = 'online'
    let message: string | undefined
    if (container) {
      const c = await docker.inspect(container)
      if (!c) return { state: 'offline', message: 'container not found' }
      if (c.state !== 'running') return { state: 'offline', message: c.state }
      if (c.health === 'unhealthy') [state, message] = ['degraded', 'unhealthy']
    }
    if (healthUrl && !(await probe(healthUrl))) return container ? { state: 'degraded', message: 'health check failed' } : { state: 'offline', message: 'health check failed' }
    if (!container && !healthUrl) message = 'not monitored'
    return { state, message }
  }

  if (!container) return { manifest, status }

  const control = (verb: 'start' | 'stop' | 'restart', title: string, description: string) => ({
    id: verb,
    method: 'POST' as const,
    path: `/${verb}`,
    title,
    description,
    mutating: true,
    run: async (): Promise<unknown> => {
      await docker.control(container, verb)
      return { container, did: verb }
    },
  })

  return {
    manifest,
    status,
    actions: [
      {
        id: 'details',
        method: 'GET',
        path: '/details',
        title: 'Container details',
        description: 'State, image and start time of the container.',
        mutating: false,
        run: async () => ({ container, ...((await docker.inspect(container)) ?? { state: 'not found' }) }),
      },
      {
        id: 'logs',
        method: 'GET',
        path: '/logs',
        title: 'Container logs',
        description: 'The last lines the container wrote.',
        mutating: false,
        input: { type: 'object', properties: { lines: { type: 'integer', minimum: 1, maximum: MAX_LOG_LINES, description: `How many lines, default ${DEFAULT_LOG_LINES}` } } },
        run: async (input: { lines?: unknown }) => {
          const asked = typeof input?.lines === 'number' ? Math.round(input.lines) : DEFAULT_LOG_LINES
          return docker.logs(container, Math.min(MAX_LOG_LINES, Math.max(1, asked)))
        },
      },
      control('start', 'Start', 'Starts the container.'),
      control('stop', 'Stop', 'Stops the container.'),
      control('restart', 'Restart', 'Restarts the container.'),
    ] as ServerService['actions'],
  }
}
