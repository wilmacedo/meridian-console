import type { KillSwitch } from '../kill-switch.js'
import type { Device, DeviceStore } from '../store.js'
import type { Socket } from '../browser/gateway.js'
import { RpcFailure } from '../browser/gateway.js'
import { newNonce, serverProof, verifyDeviceProof } from './handshake.js'
import { decode, type ServerKey } from './keys.js'
import { EXECUTOR_PROTOCOL, parseCapabilities, type CallResult, type CapabilityInfo, type Hello } from './protocol.js'

const STEP_TIMEOUT_MS = 10_000
const PENDING_TIMEOUT_MS = 15 * 60_000
const CALL_TIMEOUT_MS = 30_000
const SILENCE_MS = 90_000
const SWEEP_MS = 1_000
const MAX_PENDING = 5
const MAX_HANDSHAKING = 16

const plain = (text: unknown, max: number, fallback: string): string => String(text).replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback

interface Waiting {
  resolve: (r: { text: string; image?: Buffer }) => void
  reject: (err: Error) => void
}

export class ExecutorConnection {
  readonly connectedAt: number
  lastSeen: number
  private readonly waiting = new Map<string, Waiting>()
  private counter = 0
  private gone = false

  constructor(
    readonly device: Device,
    readonly hello: Hello,
    readonly capabilities: CapabilityInfo[],
    private readonly socket: Socket,
    private readonly now: () => number,
  ) {
    this.connectedAt = now()
    this.lastSeen = this.connectedAt
  }

  get name(): string {
    return this.device.label
  }

  call(capability: string, input: unknown, timeoutMs = CALL_TIMEOUT_MS): Promise<{ text: string; image?: Buffer }> {
    if (this.gone) return Promise.reject(new RpcFailure('cancelled', 'The device disconnected.'))
    const id = `c-${++this.counter}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        reject(new RpcFailure('timeout', `${capability} did not answer in ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)
      this.waiting.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) })
      try {
        this.socket.send(JSON.stringify({ type: 'call', id, capability, input }))
      } catch (err) {
        this.waiting.delete(id)
        clearTimeout(timer)
        reject(err as Error)
      }
    })
  }

  receive(data: Buffer | string): void {
    let frame: { type?: string } & Partial<CallResult>
    try {
      frame = JSON.parse(data.toString())
    } catch {
      return
    }
    this.lastSeen = this.now()
    if (frame.type !== 'result' || typeof frame.id !== 'string') return
    const w = this.waiting.get(frame.id)
    if (!w) return
    this.waiting.delete(frame.id)
    if (frame.ok) w.resolve({ text: String(frame.text ?? ''), image: typeof frame.image_png_base64 === 'string' ? Buffer.from(frame.image_png_base64, 'base64') : undefined })
    else w.reject(new RpcFailure('failed', String(frame.error ?? 'the device reported an error')))
  }

  fail(reason: string): void {
    this.gone = true
    for (const w of this.waiting.values()) w.reject(new RpcFailure('cancelled', reason))
    this.waiting.clear()
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason)
  }
}

export interface ExecutorGatewayOptions {
  store: DeviceStore
  killSwitch: KillSwitch
  serverKey: ServerKey
  now?: () => number
}

interface Pending {
  device: Device
  socket: Socket
}

export class ExecutorGateway {
  private readonly connections = new Map<string, ExecutorConnection>()
  private readonly pending = new Map<string, Pending>()
  private readonly now: () => number
  private handshaking = 0
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly o: ExecutorGatewayOptions) {
    this.now = o.now ?? Date.now
  }

  start(): void {
    this.timer ??= setInterval(() => this.sweep(), SWEEP_MS)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  // Revoked or lapsed devices, and devices gone quiet, lose their socket.
  sweep(): void {
    const now = this.now()
    for (const [id, conn] of this.connections) {
      if (!this.o.store.active(id)) conn.close(4001, 'authorization ended')
      else if (now - conn.lastSeen > SILENCE_MS) conn.close(4002, 'silent')
    }
    for (const [id, p] of this.pending) if (!this.o.store.active(id)) p.socket.close(4001, 'authorization ended')
  }

  list(): ExecutorConnection[] {
    return [...this.connections.values()]
  }

  // The one connection a name or id picks; ambiguity is refused rather than guessed.
  find(who: string): ExecutorConnection {
    const wanted = who.trim().toLowerCase()
    const hits = this.list().filter((c) => c.device.id === wanted || c.name.toLowerCase() === wanted)
    if (hits.length === 1) return hits[0]
    const names = this.list().map((c) => c.name).join(', ') || 'none'
    throw new Error(hits.length > 1 ? `Two devices are called "${who}".` : `No device called "${who}" is connected (connected: ${names}).`)
  }

  disconnect(deviceId: string, reason = 'disconnected'): void {
    this.connections.get(deviceId)?.close(4001, reason)
    this.pending.get(deviceId)?.socket.close(4001, reason)
  }

  // The owner approved a device that is waiting: let it in without making it reconnect.
  admit(deviceId: string): void {
    this.pending.get(deviceId)?.socket.send(JSON.stringify({ type: 'ready' }))
  }

  attach(socket: Socket): void {
    const { killSwitch, store, serverKey } = this.o
    if (!killSwitch.admit(socket)) return
    // Nobody has proved anything yet at this point, so how many may be mid-handshake is bounded.
    if (this.handshaking >= MAX_HANDSHAKING) return killSwitch.release(socket), socket.close(1013, 'busy')
    this.handshaking++
    let counted = true
    const settled = (): void => {
      if (counted) this.handshaking--
      counted = false
    }

    let step: 'hello' | 'proof' | 'pending' | 'capabilities' | 'connected' = 'hello'
    let hello: Hello | undefined
    let serverNonce = ''
    let device: Device | undefined
    let conn: ExecutorConnection | undefined
    let timer = setTimeout(() => socket.close(1008, 'handshake timeout'), STEP_TIMEOUT_MS)
    const next = (s: typeof step, ms = STEP_TIMEOUT_MS, reason = 'handshake timeout'): void => {
      step = s
      if (s !== 'proof') settled()
      clearTimeout(timer)
      timer = setTimeout(() => socket.close(1008, reason), ms)
    }
    const send = (frame: Record<string, unknown>): void => socket.send(JSON.stringify(frame))
    const refuse = (code: number, reason: string): void => socket.close(code, reason)

    socket.on('message', (data) => {
      if (step === 'connected') return conn?.receive(data)
      let frame: Record<string, unknown>
      try {
        frame = JSON.parse(data.toString())
      } catch {
        return refuse(1008, 'bad frame')
      }

      if (step === 'hello') {
        const h = frame as unknown as Hello
        if (h.type !== 'hello' || h.protocol !== EXECUTOR_PROTOCOL || !decode(h.public_key, 32) || !decode(h.client_nonce, 32) || typeof h.name !== 'string') return refuse(1002, 'unsupported hello')
        // Anyone on the network can send a hello, and these fields reach the model, so they are cut down to plain words.
        hello = { ...h, name: plain(h.name, 40, 'device'), os: /^[a-z0-9]{1,20}$/.test(String(h.os)) ? h.os : 'unknown', version: /^[0-9A-Za-z.+-]{1,20}$/.test(String(h.version)) ? h.version : '?' }
        serverNonce = newNonce()
        const signature = serverProof(serverKey, h.client_nonce, serverNonce, h.public_key)!
        send({ type: 'challenge', protocol: EXECUTOR_PROTOCOL, server_nonce: serverNonce, server_public_key: serverKey.publicKey, server_signature: signature })
        return next('proof')
      }

      if (step === 'proof') {
        if (frame.type !== 'proof' || typeof frame.signature !== 'string' || !hello) return refuse(1008, 'proof expected')
        if (!verifyDeviceProof(hello.public_key, hello.client_nonce, serverNonce, serverKey.publicKey, frame.signature)) return refuse(4003, 'bad proof')
        const known = store.executorByKey(hello.public_key)
        if (known?.device.revokedAt) return refuse(4003, 'revoked')
        if (!known && store.pendingExecutors().length >= MAX_PENDING) return refuse(1013, 'too many devices waiting for approval')
        device = known?.device ?? store.addExecutor(hello.name, hello.public_key)
        if (known?.approvedAt) {
          send({ type: 'ready' })
          return next('capabilities')
        }
        send({ type: 'pending' })
        // The same device knocking again replaces its earlier knock instead of leaving it open.
        const earlier = this.pending.get(device.id)
        this.pending.delete(device.id)
        earlier?.socket.close(4000, 'replaced by a newer connection')
        this.pending.set(device.id, { device, socket })
        return next('pending', PENDING_TIMEOUT_MS, 'not approved in time')
      }

      if (step === 'pending') {
        // Only the server moves it on, by `admit`; once approved the executor announces its capabilities.
        if (frame.type === 'capabilities' && device && store.executorByKey(hello!.public_key)?.approvedAt) {
          this.pending.delete(device.id)
          step = 'capabilities'
        } else return
      }

      if (step === 'capabilities') {
        const caps = frame.type === 'capabilities' ? parseCapabilities(frame as never) : undefined
        if (!caps || !device || !hello) return refuse(1008, 'capabilities expected')
        clearTimeout(timer)
        conn = new ExecutorConnection(device, hello, caps, socket, this.now)
        this.connections.get(device.id)?.close(4000, 'replaced by a newer connection')
        this.connections.set(device.id, conn)
        store.touch(device.id)
        step = 'connected'
      }
    })

    socket.on('close', () => {
      clearTimeout(timer)
      settled()
      killSwitch.release(socket)
      if (device && this.pending.get(device.id)?.socket === socket) {
        this.pending.delete(device.id)
        store.dropUnapproved(device.id)
      }
      if (!conn) return
      conn.fail('The device disconnected.')
      if (this.connections.get(conn.device.id) === conn) this.connections.delete(conn.device.id)
    })
  }
}
