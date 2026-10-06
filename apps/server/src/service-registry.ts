import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { ServiceStatus, ServiceSummary } from '@meridian/service-sdk'
import type { ServerService } from '@meridian/service-sdk/server'

const SERVICES_DIR = process.env.SERVICES_DIR ?? fileURLToPath(new URL('../../../services', import.meta.url))
const STATUS_TIMEOUT_MS = 3000
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const DEFAULT_HOST = 'local'

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

// One broken service must not take the dashboard down, so every failure here is logged and skipped.
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
  if (!service.status) return { state: 'ok' }

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
    return { state: 'err', message: 'status check failed' }
  } finally {
    clearTimeout(timer)
  }
}

export async function registerServices(app: FastifyInstance): Promise<void> {
  const services = await discover(app)

  for (const service of services) {
    if (service.routes) await app.register(service.routes, { prefix: `/api/services/${service.manifest.id}` })
    app.log.info(`service "${service.manifest.id}" registered`)
  }

  app.get('/api/services', async (): Promise<ServiceSummary[]> =>
    Promise.all(
      services.map(async (service) => ({
        ...service.manifest,
        host: service.manifest.host ?? DEFAULT_HOST,
        status: await readStatus(app, service),
      })),
    ),
  )
}
