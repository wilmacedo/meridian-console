import type { FastifyInstance } from 'fastify'
import { StaleVersionError, WorkspaceNotFoundError, type WorkspaceStore } from './workspace-store.js'

export function registerWorkspaces(app: FastifyInstance, store: WorkspaceStore): void {
  app.get('/api/workspaces', async () => store.list())

  app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => store.get(request.params.id) ?? reply.code(404).send({ error: 'no such workspace' }))

  app.post<{ Body: { name: string } }>(
    '/api/workspaces',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } } } },
    async (request, reply) => reply.code(201).send(store.create(request.body.name)),
  )

  // The body carries the version it was based on; a stale one is rejected with the current workspace,
  // so two screens never silently overwrite each other.
  app.put<{ Params: { id: string }; Body: { version: number; state: Record<string, unknown> } }>(
    '/api/workspaces/:id',
    { schema: { body: { type: 'object', required: ['version', 'state'], properties: { version: { type: 'integer' }, state: { type: 'object' } } } } },
    async (request, reply) => {
      try {
        const { id, version, updatedAt } = store.update(request.params.id, request.body.version, request.body.state)
        return { id, version, updatedAt }
      } catch (err) {
        if (err instanceof StaleVersionError) return reply.code(409).send(err.current)
        if (err instanceof WorkspaceNotFoundError) return reply.code(404).send({ error: 'no such workspace' })
        throw err
      }
    },
  )
}
