import { randomBytes } from 'node:crypto'
import type { KillSwitch } from '../kill-switch.js'
import type { Device, DeviceStore } from '../store.js'
import { isRequest, isResponse, protocolCompatible, PROTOCOL_VERSION, MIN_COMPATIBLE_PROTOCOL, SERVER_NAME, type Frame, type HandshakeParams, type HandshakeResult, type RpcError, type ToolMethod, type ToolResults } from './protocol.js'

// The part of a WebSocket the gateway uses, so a test can stand in for the extension.
export interface Socket {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  on: ((event: 'message', cb: (data: Buffer | string) => void) => unknown) & ((event: 'close', cb: () => void) => unknown)
}

export class RpcFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reason?: string,
  ) {
    super(message)
  }
}

const HANDSHAKE_TIMEOUT_MS = 10_000
const CALL_TIMEOUT_MS = 30_000
const SWEEP_MS = 1_000

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

export class BrowserConnection {
  readonly connectedAt: number
  lastSeen: number
  private readonly pending = new Map<string, Pending>()
  private readonly queues = new Map<string, Promise<unknown>>()
  private counter = 0
  private gone = false

  constructor(
    readonly device: Device,
    readonly hello: HandshakeParams,
    private readonly socket: Socket,
    private readonly now: () => number,
  ) {
    this.connectedAt = now()
    this.lastSeen = this.connectedAt
  }

  // What the owner called this browser in the extension popup: `personal`, `work`.
  get profile(): string {
    return this.hello.label
  }

  // One call at a time per session: the extension keeps its element refs per session, so overlapping calls would
  // act on refs another call just invalidated. Different sessions run in parallel.
  call<M extends ToolMethod>(method: M, params: { session_id: string } & Record<string, unknown>, timeoutMs = CALL_TIMEOUT_MS): Promise<ToolResults[M]> {
    const key = params.session_id
    const run = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => this.request(method, params, timeoutMs))
    this.queues.set(key, run)
    void run.catch(() => undefined).then(() => {
      if (this.queues.get(key) === run) this.queues.delete(key)
    })
    return run as Promise<ToolResults[M]>
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.gone) return Promise.reject(new RpcFailure('cancelled', 'The browser disconnected.'))
    const id = `g-${++this.counter}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.send({ id: `g-${++this.counter}`, method: 'cancel', params: { rpc_id: id } })
        reject(new RpcFailure('timeout', `${method} did not answer in ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      })
      try {
        this.send({ id, method, params })
      } catch (err) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(err as Error)
      }
    })
  }

  receive(data: Buffer | string): void {
    let frame: Frame
    try {
      frame = JSON.parse(data.toString()) as Frame
    } catch {
      return
    }
    this.lastSeen = this.now()
    if (isResponse(frame)) {
      const waiting = this.pending.get(frame.id)
      if (!waiting) return
      this.pending.delete(frame.id)
      if ('error' in frame) waiting.reject(new RpcFailure(frame.error.code, frame.error.message, frame.error.data?.reason))
      else waiting.resolve(frame.result)
    } else if (isRequest(frame) && typeof frame.id === 'string') {
      // The extension never needs anything from us beyond the handshake; refuse politely instead of hanging it.
      const error: RpcError = { code: 'unknown_method', message: `${frame.method} is not served here` }
      this.send({ id: frame.id, error })
    }
    // Events (heartbeats, session notices) need no answer: refreshing lastSeen above is all they are for.
  }

  fail(reason: string): void {
    this.gone = true
    for (const p of this.pending.values()) p.reject(new RpcFailure('cancelled', reason))
    this.pending.clear()
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason)
  }

  private send(frame: Frame): void {
    this.socket.send(JSON.stringify(frame))
  }
}

export interface GatewayOptions {
  store: DeviceStore
  killSwitch: KillSwitch
  maxConnections?: number
  now?: () => number
}

export class BrowserGateway {
  private readonly connections = new Map<string, BrowserConnection>()
  private readonly max: number
  private readonly now: () => number
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly o: GatewayOptions) {
    this.max = o.maxConnections ?? 64
    this.now = o.now ?? Date.now
  }

  // Revocation and expiry close a socket within a second, wherever the grant was changed.
  start(): void {
    this.timer ??= setInterval(() => this.sweep(), SWEEP_MS)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  sweep(): void {
    for (const [id, conn] of this.connections) if (!this.o.store.active(id)) conn.close(4001, 'authorization ended')
  }

  list(): BrowserConnection[] {
    return [...this.connections.values()]
  }

  // The one connection a profile label names; a label two browsers share is refused rather than guessed.
  byProfile(profile: string): BrowserConnection {
    const wanted = profile.trim().toLowerCase()
    const hits = this.list().filter((c) => c.profile.toLowerCase() === wanted)
    if (hits.length === 1) return hits[0]
    const names = this.list().map((c) => c.profile).join(', ') || 'none'
    throw new Error(hits.length > 1 ? `Two browsers are both called "${profile}"; rename one in the extension popup.` : `No browser called "${profile}" is connected (connected: ${names}).`)
  }

  disconnect(deviceId: string, reason = 'disconnected'): void {
    this.connections.get(deviceId)?.close(4001, reason)
  }

  // The caller has already authenticated the device from the upgrade request.
  attach(socket: Socket, device: Device): void {
    const { killSwitch } = this.o
    if (!killSwitch.admit(socket)) return
    if (!this.connections.has(device.id) && this.connections.size >= this.max) {
      killSwitch.release(socket)
      socket.close(1013, 'at capacity')
      return
    }

    let conn: BrowserConnection | undefined
    const timer = setTimeout(() => socket.close(1008, 'handshake timeout'), HANDSHAKE_TIMEOUT_MS)

    socket.on('message', (data) => {
      if (conn) return conn.receive(data)
      clearTimeout(timer)
      conn = this.handshake(socket, device, data)
    })
    socket.on('close', () => {
      clearTimeout(timer)
      killSwitch.release(socket)
      if (!conn) return
      conn.fail('The browser disconnected.')
      if (this.connections.get(device.id) === conn) this.connections.delete(device.id)
    })
  }

  private handshake(socket: Socket, device: Device, data: Buffer | string): BrowserConnection | undefined {
    let frame: { id?: unknown; method?: unknown; params?: Partial<HandshakeParams> }
    try {
      frame = JSON.parse(data.toString())
    } catch {
      socket.close(1008, 'first frame must be system.handshake')
      return undefined
    }
    const p = frame.params
    if (frame.method !== 'system.handshake' || typeof frame.id !== 'string' || !p || typeof p.protocol_version !== 'string' || typeof p.label !== 'string' || typeof p.browser?.name !== 'string') {
      socket.close(1008, 'first frame must be system.handshake')
      return undefined
    }
    if (!protocolCompatible(p.protocol_version, p.min_compatible_protocol)) {
      const error: RpcError = { code: 'version_too_old', message: `protocol ${p.protocol_version} is not compatible with ${PROTOCOL_VERSION}`, data: { min_compatible_protocol: MIN_COMPATIBLE_PROTOCOL } }
      socket.send(JSON.stringify({ id: frame.id, error }))
      socket.close(1008, 'protocol mismatch')
      return undefined
    }

    const hello = { ...(p as HandshakeParams), label: p.label.trim().slice(0, 40) || device.label }
    const conn = new BrowserConnection(device, hello, socket, this.now)
    // A reconnect from the same device replaces its old socket; its sessions died with it.
    this.connections.get(device.id)?.close(4000, 'replaced by a newer connection')
    this.connections.set(device.id, conn)
    this.o.store.touch(device.id)

    const result: HandshakeResult = { server: SERVER_NAME, version: '0.0.0', protocol_version: PROTOCOL_VERSION, min_compatible_protocol: MIN_COMPATIBLE_PROTOCOL, audit_version: 1, audit_ready: false }
    socket.send(JSON.stringify({ id: frame.id, result }))
    return conn
  }
}

export const newSessionId = (): string => Array.from(randomBytes(4), (b) => String.fromCharCode(97 + (b % 26))).join('')
