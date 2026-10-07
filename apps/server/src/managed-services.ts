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

export class ManagedServiceStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS managed_services (
      id TEXT PRIMARY KEY,
      spec TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)
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
