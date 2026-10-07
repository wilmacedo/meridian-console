import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

// Where the built frontend is, unless MERIDIAN_WEB_DIST says otherwise (`pnpm build` writes it).
export const defaultWebRoot = (): string => process.env.MERIDIAN_WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url))

// Serves the built frontend from the same port as the API, so one origin (and one `tailscale serve`)
// is enough and the Vite dev server is not needed to run Meridian. Returns false when there is no build,
// which is the normal state while developing. Hashed assets never change, so they cache for good;
// the page itself must always be revalidated or a new build would never show up.
export async function registerWebApp(app: FastifyInstance, root: string): Promise<boolean> {
  if (!existsSync(join(root, 'index.html'))) return false
  await app.register(fastifyStatic, {
    root,
    cacheControl: false,
    setHeaders: (res, path) => {
      res.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    },
  })
  return true
}
