// A small Chrome DevTools Protocol client for one page target: enough to evaluate a script and send real mouse and
// text input. A connection is opened per tool call (loopback, through the tunnel), so no state outlives a call
// except what the page itself keeps.

export interface CdpTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}

export async function listTargets(port: number): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })
  return (await res.json()) as CdpTarget[]
}

export class CdpError extends Error {}

interface Waiting {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

export class CdpSession {
  private nextId = 0
  private readonly waiting = new Map<number, Waiting>()

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } }
      const w = msg.id === undefined ? undefined : this.waiting.get(msg.id)
      if (!w || msg.id === undefined) return
      this.waiting.delete(msg.id)
      if (msg.error) w.reject(new CdpError(msg.error.message))
      else w.resolve(msg.result)
    })
    socket.addEventListener('close', () => this.failAll('The app closed the connection.'))
  }

  static open(wsUrl: string, timeoutMs = 5000): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => (socket.close(), reject(new CdpError('The app did not accept the debug connection.'))), timeoutMs)
      socket.addEventListener('open', () => (clearTimeout(timer), resolve(new CdpSession(socket))))
      socket.addEventListener('error', () => (clearTimeout(timer), reject(new CdpError('Could not connect to the app page.'))))
    })
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN) return reject(new CdpError('The app closed the connection.'))
      const id = ++this.nextId
      const timer = setTimeout(() => (this.waiting.delete(id), reject(new CdpError(`${method} did not answer in ${Math.round(timeoutMs / 1000)}s`))), timeoutMs)
      this.waiting.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v as T)), reject: (e) => (clearTimeout(timer), reject(e)) })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  // Runs an expression in the page and returns its value (a JSON-able one), or throws what the page threw.
  async evaluate<T>(expression: string): Promise<T> {
    const r = await this.send<{ result: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text: string } }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new CdpError(`The page refused the script: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value as T
  }

  // A real click: the page sees the same mouse events a person would cause.
  async click(x: number, y: number): Promise<void> {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }

  insertText(text: string): Promise<unknown> {
    return this.send('Input.insertText', { text })
  }

  close(): void {
    this.socket.close()
  }

  private failAll(reason: string): void {
    for (const w of this.waiting.values()) w.reject(new CdpError(reason))
    this.waiting.clear()
  }
}
