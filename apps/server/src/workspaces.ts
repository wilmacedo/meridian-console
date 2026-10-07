import type { FastifyInstance } from 'fastify'
import { StaleVersionError, WorkspaceNameTakenError, WorkspaceNotFoundError, WorkspaceProtectedError, type WorkspaceStore } from './workspace-store.js'

export function registerWorkspaces(app: FastifyInstance, store: WorkspaceStore): void {
  app.get<{ Querystring: { state?: string } }>('/api/workspaces', async (request) => (request.query.state ? store.listFull() : store.list()))

  app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => store.get(request.params.id) ?? reply.code(404).send({ error: 'no such workspace' }))

  app.post<{ Body: { name: string; id?: string } }>(
    '/api/workspaces',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 }, id: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', maxLength: 60 } } } } },
    async (request, reply) => {
      try {
        return reply.code(201).send(store.create(request.body.name, request.body.id))
      } catch (err) {
        if (err instanceof WorkspaceNameTakenError) return reply.code(409).send({ error: 'a workspace with that name already exists' })
        throw err
      }
    },
  )

  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/api/workspaces/:id',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } } } },
    async (request, reply) => {
      try {
        const { id, name } = store.rename(request.params.id, request.body.name)
        return { id, name }
      } catch (err) {
        if (err instanceof WorkspaceNameTakenError) return reply.code(409).send({ error: 'a workspace with that name already exists' })
        if (err instanceof WorkspaceNotFoundError) return reply.code(404).send({ error: 'no such workspace' })
        throw err
      }
    },
  )

  app.post<{ Params: { id: string }; Body: { name?: string } | undefined }>(
    '/api/workspaces/:id/duplicate',
    { schema: { body: { type: ['object', 'null'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } } } },
    async (request, reply) => {
      try {
        return reply.code(201).send(store.duplicate(request.params.id, request.body?.name))
      } catch (err) {
        if (err instanceof WorkspaceNotFoundError) return reply.code(404).send({ error: 'no such workspace' })
        throw err
      }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    try {
      store.remove(request.params.id)
      return reply.code(204).send()
    } catch (err) {
      if (err instanceof WorkspaceProtectedError) return reply.code(400).send({ error: 'the default workspace cannot be deleted' })
      if (err instanceof WorkspaceNotFoundError) return reply.code(404).send({ error: 'no such workspace' })
      throw err
    }
  })

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
