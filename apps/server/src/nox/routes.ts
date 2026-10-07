import type { FastifyInstance } from 'fastify'
import type { EventBus } from '../event-bus.js'
import type { Nox } from './process.js'

const MAX_UTTERANCE = 2000

// The one entry point to NOX: voice will post here, and so does the dev CLI. The answer streams back as
// newline-delimited JSON events (text, tool, done, error).
export function registerNox(app: FastifyInstance, nox: Nox, bus: EventBus): void {
  app.post<{ Body: { text: string; workspace?: string } }>(
    '/api/nox/say',
    { schema: { body: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: MAX_UTTERANCE }, workspace: { type: 'string' } } } } },
    async (request, reply) => {
      const { text, workspace = 'default' } = request.body
      bus.emit('nox', 'info', `request: ${text.slice(0, 120)}`)
      reply.hijack()
      reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
      for await (const event of nox.say(text, workspace)) {
        if (event.type === 'error') bus.emit('nox', 'error', event.message)
        reply.raw.write(`${JSON.stringify(event)}\n`)
      }
      reply.raw.end()
    },
  )
}
