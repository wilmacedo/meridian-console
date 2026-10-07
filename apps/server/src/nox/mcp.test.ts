import { describe, expect, it } from 'vitest'
import { McpServer, type McpTool } from './mcp.js'

const echo: McpTool = { name: 'echo', description: 'Echoes', inputSchema: { type: 'object', properties: { text: { type: 'string' } } }, handler: (a) => `said ${String(a.text)}` }
const boom: McpTool = { name: 'boom', description: 'Fails', inputSchema: { type: 'object' }, handler: () => Promise.reject(new Error('nope')) }
const server = new McpServer('meridian', [echo, boom])
const call = (method: string, params?: Record<string, unknown>) => server.handle({ jsonrpc: '2.0', id: 1, method, params })

describe('McpServer', () => {
  it('answers initialize with the tools capability and echoes the client protocol version', async () => {
    const res = (await call('initialize', { protocolVersion: '2025-06-18' })) as { result: { protocolVersion: string; capabilities: object; serverInfo: { name: string } } }
    expect(res.result.protocolVersion).toBe('2025-06-18')
    expect(res.result.capabilities).toHaveProperty('tools')
    expect(res.result.serverInfo.name).toBe('meridian')
  })

  it('gives notifications no response', async () => {
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })

  it('lists tools with their schemas but not their handlers', async () => {
    const res = (await call('tools/list')) as { result: { tools: Record<string, unknown>[] } }
    expect(res.result.tools.map((t) => t.name)).toEqual(['echo', 'boom'])
    expect(res.result.tools[0]).not.toHaveProperty('handler')
    expect(res.result.tools[0]).toHaveProperty('inputSchema')
  })

  it('calls a tool and returns its text', async () => {
    const res = await call('tools/call', { name: 'echo', arguments: { text: 'oi' } })
    expect(res).toMatchObject({ result: { content: [{ type: 'text', text: 'said oi' }] } })
  })

  it('reports a failing tool as a tool error the model can read', async () => {
    const res = await call('tools/call', { name: 'boom' })
    expect(res).toMatchObject({ result: { isError: true, content: [{ text: 'nope' }] } })
  })

  it('rejects unknown tools and methods', async () => {
    expect(await call('tools/call', { name: 'missing' })).toMatchObject({ error: { code: -32602 } })
    expect(await call('resources/list')).toMatchObject({ error: { code: -32601 } })
  })

  it('rejects something that is not JSON-RPC', async () => {
    expect(await server.handle({ hello: 1 })).toMatchObject({ error: { code: -32600 } })
  })
})
