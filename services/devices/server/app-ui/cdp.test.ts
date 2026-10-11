import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { CdpSession, listTargets } from './cdp.js'

let close: (() => void) | undefined
afterEach(() => close?.())

// A page that answers the few methods the client uses.
async function fakePage(handler: (method: string, params: Record<string, unknown>) => unknown) {
  const http = createServer((req, res) => {
    const port = (http.address() as AddressInfo).port
    res.end(JSON.stringify([{ id: 'p1', type: 'page', title: 'App', url: 'tauri://localhost/', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/p1` }]))
    void req
  })
  const wss = new WebSocketServer({ server: http })
  const received: { method: string; params: Record<string, unknown> }[] = []
  wss.on('connection', (ws) =>
    ws.on('message', (raw) => {
      const { id, method, params } = JSON.parse(raw.toString())
      received.push({ method, params })
      const out = handler(method, params) as { error?: string } | undefined
      ws.send(JSON.stringify(out?.error ? { id, error: { message: out.error } } : { id, result: out ?? {} }))
    }),
  )
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
  close = () => (wss.clients.forEach((c) => c.terminate()), wss.close(), http.close())
  return { port: (http.address() as AddressInfo).port, received }
}

describe('CdpSession', () => {
  it('lists the page targets of the debug port', async () => {
    const { port } = await fakePage(() => ({}))
    expect((await listTargets(port))[0]).toMatchObject({ type: 'page', title: 'App' })
  })

  it('evaluates a script and returns its value', async () => {
    const { port, received } = await fakePage((m) => (m === 'Runtime.evaluate' ? { result: { value: ['a', 1] } } : {}))
    const [page] = await listTargets(port)
    const s = await CdpSession.open(page.webSocketDebuggerUrl!)
    expect(await s.evaluate('1+1')).toEqual(['a', 1])
    expect(received[0]).toMatchObject({ method: 'Runtime.evaluate', params: { expression: '1+1', returnByValue: true, awaitPromise: true } })
    s.close()
  })

  it('turns an exception in the page into an error', async () => {
    const { port } = await fakePage(() => ({ result: {}, exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: x is not defined' } } }))
    const [page] = await listTargets(port)
    const s = await CdpSession.open(page.webSocketDebuggerUrl!)
    await expect(s.evaluate('x')).rejects.toThrow('ReferenceError: x is not defined')
    s.close()
  })

  it('sends a click as real mouse events: move, press, release', async () => {
    const { port, received } = await fakePage(() => ({}))
    const [page] = await listTargets(port)
    const s = await CdpSession.open(page.webSocketDebuggerUrl!)
    await s.click(10, 20)
    expect(received.map((r) => [r.method, r.params.type, r.params.x, r.params.y])).toEqual([
      ['Input.dispatchMouseEvent', 'mouseMoved', 10, 20],
      ['Input.dispatchMouseEvent', 'mousePressed', 10, 20],
      ['Input.dispatchMouseEvent', 'mouseReleased', 10, 20],
    ])
    s.close()
  })

  it('surfaces a protocol error and a connection that closes under a pending call', async () => {
    const { port } = await fakePage((m) => (m === 'Bad.method' ? { error: 'not found' } : undefined))
    const [page] = await listTargets(port)
    const s = await CdpSession.open(page.webSocketDebuggerUrl!)
    await expect(s.send('Bad.method')).rejects.toThrow('not found')
    close?.()
    await new Promise((r) => setTimeout(r, 50))
    await expect(s.send('Anything', {}, 500)).rejects.toThrow('The app closed the connection.')
  })

  it('reports a refused connection in words', async () => {
    await expect(CdpSession.open('ws://127.0.0.1:1/devtools/page/x', 1000)).rejects.toThrow('Could not connect to the app page.')
  })
})
