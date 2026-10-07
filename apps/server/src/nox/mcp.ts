import type { FastifyInstance } from 'fastify'

export interface McpTool {
  name: string
  description: string
  // JSON Schema of the arguments.
  inputSchema: Record<string, unknown>
  // Returns the text the model reads. Throwing reports the failure to the model as a tool error.
  handler: (args: Record<string, unknown>) => Promise<string> | string
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

type JsonRpcResponse = { jsonrpc: '2.0'; id: string | number | null; result: unknown } | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string } }

const PROTOCOL_VERSION = '2025-03-26'
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INVALID_REQUEST = -32600

const failure = (id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

// The smallest stateless MCP server that Claude Code can use over HTTP: initialize, ping, tools/list
// and tools/call. Tools are all it offers, so there are no sessions and nothing to stream.
export class McpServer {
  constructor(
    private name: string,
    private tools: McpTool[],
  ) {}

  // Returns null for notifications, which get no response.
  async handle(request: unknown): Promise<JsonRpcResponse | null> {
    const req = request as Partial<JsonRpcRequest> | null
    if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return failure(undefined, INVALID_REQUEST, 'not a JSON-RPC request')
    if (req.id === undefined) return null
    const id = req.id

    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: this.name, version: '0.0.0' },
          },
        }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} }
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: this.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } }
      case 'tools/call': {
        const tool = this.tools.find((t) => t.name === req.params?.name)
        if (!tool) return failure(id, INVALID_PARAMS, `unknown tool "${String(req.params?.name)}"`)
        try {
          const args = (req.params?.arguments ?? {}) as Record<string, unknown>
          return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: await tool.handler(args) }] } }
        } catch (err) {
          return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : 'tool failed' }] } }
        }
      }
      default:
        return failure(id, METHOD_NOT_FOUND, `unknown method "${req.method}"`)
    }
  }
}

// A route can serve one server, or pick one from the URL parameters (the gate knows its workspace that way).
export function registerMcp(app: FastifyInstance, path: string, server: McpServer | ((params: Record<string, string>) => McpServer)): void {
  app.post(path, async (request, reply) => {
    const mcp = typeof server === 'function' ? server(request.params as Record<string, string>) : server
    const body = request.body as unknown
    if (Array.isArray(body)) {
      const responses = (await Promise.all(body.map((r) => mcp.handle(r)))).filter((r) => r !== null)
      return responses.length ? responses : reply.code(202).send()
    }
    const response = await mcp.handle(body)
    return response ?? reply.code(202).send()
  })
  // No server-initiated messages: the optional SSE stream and session teardown are not offered.
  app.get(path, async (_request, reply) => reply.code(405).send())
  app.delete(path, async (_request, reply) => reply.code(405).send())
}
