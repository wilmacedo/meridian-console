import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeExtension } from '../browser/test-support.js'
import { KillSwitch } from '../kill-switch.js'
import { DeviceStore } from '../store.js'
import { ExecutorGateway } from './gateway.js'
import { b64, ServerKey } from './keys.js'
import type { CapabilityInfo } from './protocol.js'

afterEach(() => vi.useRealTimers())

const CAPS: CapabilityInfo[] = [
  { name: 'window_list', tier: 'observe', description: 'List windows', input: { type: 'object', properties: {} } },
  { name: 'process_kill', tier: 'irreversible', description: 'Kill a process', input: { type: 'object', required: ['pid'], properties: { pid: { type: 'integer' } } } },
]

// Stands in for the Rust executor: a real Ed25519 key pair and the same signatures.
class Device {
  readonly key: KeyObject
  readonly pub: string
  readonly ext = new FakeExtension()
  constructor(seed?: KeyObject) {
    this.key = seed ?? generateKeyPairSync('ed25519').privateKey
    this.pub = b64((createPublicKey(this.key).export({ format: 'der', type: 'spki' }) as Buffer).subarray(12))
  }
  get frames(): Record<string, unknown>[] {
    return this.ext.sent
  }
  last(): Record<string, unknown> {
    return this.ext.sent.at(-1)!
  }
  hello(over: Record<string, unknown> = {}): this {
    this.ext.say({ type: 'hello', protocol: 1, public_key: this.pub, client_nonce: b64(Buffer.alloc(32, 7)), name: 'win-lan', os: 'windows', version: '0.1.0', ...over })
    return this
  }
  prove(serverPub: string): this {
    const challenge = this.ext.sent.find((f) => f.type === 'challenge') as { server_nonce: string }
    const msg = Buffer.concat([Buffer.from('meridian-executor/v1/device\0'), Buffer.alloc(32, 7), Buffer.from(challenge.server_nonce, 'base64'), Buffer.from(serverPub, 'base64')])
    this.ext.say({ type: 'proof', signature: b64(sign(null, msg, this.key)) })
    return this
  }
  announce(items: unknown = CAPS): this {
    this.ext.say({ type: 'capabilities', items })
    return this
  }
}

function setup() {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const killSwitch = new KillSwitch(store)
  const serverKey = ServerKey.fromPrivate(generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer)
  const gateway = new ExecutorGateway({ store, killSwitch, serverKey })
  const connect = (d = new Device()) => (gateway.attach(d.ext.socket), d)
  return { store, killSwitch, serverKey, gateway, connect }
}

// A device that is approved and announced its capabilities.
function online(s: ReturnType<typeof setup>) {
  const d = s.connect().hello().prove(s.serverKey.publicKey)
  const device = s.store.executorByKey(d.pub)!.device
  s.store.approveExecutorKey(device.id)
  s.gateway.admit(device.id)
  d.announce()
  return { d, device }
}

describe('the handshake', () => {
  it('answers a hello with a challenge the executor can check against the key it pinned', () => {
    const s = setup()
    const d = s.connect().hello()
    expect(d.last()).toMatchObject({ type: 'challenge', protocol: 1, server_public_key: s.serverKey.publicKey })
    expect((d.last() as { server_signature: string }).server_signature).toHaveLength(88)
  })

  it('holds an unknown device as pending, with no power', () => {
    const s = setup()
    const d = s.connect().hello().prove(s.serverKey.publicKey)
    expect(d.last()).toEqual({ type: 'pending' })
    expect(s.store.pendingExecutors().map((p) => p.label)).toEqual(['win-lan'])
    d.announce()
    expect(s.gateway.list()).toHaveLength(0)
  })

  it('lets it in the moment the owner approves, without a reconnect', () => {
    const s = setup()
    const { d } = online(s)
    expect(d.frames.map((f) => f.type)).toEqual(['challenge', 'pending', 'ready'])
    expect(s.gateway.find('win-lan').capabilities.map((c) => c.name)).toEqual(['window_list', 'process_kill'])
  })

  it('lets an approved device straight in when it comes back', () => {
    const s = setup()
    const first = online(s)
    first.d.ext.emit('close')
    const again = s.connect(new Device(first.d.key)).hello().prove(s.serverKey.publicKey)
    expect(again.last()).toEqual({ type: 'ready' })
    again.announce()
    expect(s.gateway.list()).toHaveLength(1)
  })

  it('refuses a wrong signature without enrolling anything', () => {
    const s = setup()
    const d = s.connect().hello()
    d.ext.say({ type: 'proof', signature: b64(Buffer.alloc(64)) })
    expect(d.ext.closed?.code).toBe(4003)
    expect(s.store.pendingExecutors()).toEqual([])
  })

  it('refuses a proof signed by a different key than the one in the hello', () => {
    const s = setup()
    const d = s.connect().hello()
    const thief = new Device()
    const challenge = d.ext.sent.find((f) => f.type === 'challenge') as { server_nonce: string }
    const msg = Buffer.concat([Buffer.from('meridian-executor/v1/device\0'), Buffer.alloc(32, 7), Buffer.from(challenge.server_nonce, 'base64'), Buffer.from(s.serverKey.publicKey, 'base64')])
    d.ext.say({ type: 'proof', signature: b64(sign(null, msg, thief.key)) })
    expect(d.ext.closed?.code).toBe(4003)
    expect(s.store.pendingExecutors()).toEqual([])
  })

  it('refuses a revoked device, and does not enroll it again', () => {
    const s = setup()
    const { d, device } = online(s)
    s.store.revoke(device.id)
    d.ext.emit('close')
    const again = s.connect(new Device(d.key)).hello().prove(s.serverKey.publicKey)
    expect(again.ext.closed).toMatchObject({ code: 4003, reason: 'revoked' })
    expect(s.store.pendingExecutors()).toEqual([])
  })

  it('refuses an unsupported protocol version and malformed hellos', () => {
    const s = setup()
    expect(s.connect().hello({ protocol: 2 }).ext.closed?.code).toBe(1002)
    expect(s.connect().hello({ client_nonce: 'short' }).ext.closed?.code).toBe(1002)
    expect(s.connect().hello({ public_key: 'nope' }).ext.closed?.code).toBe(1002)
  })

  it('limits how many unknown devices may wait for approval', () => {
    const s = setup()
    for (let i = 0; i < 5; i++) s.connect().hello().prove(s.serverKey.publicKey)
    const sixth = s.connect().hello().prove(s.serverKey.publicKey)
    expect(sixth.ext.closed?.code).toBe(1013)
  })

  it('closes a device that stops mid-handshake', () => {
    vi.useFakeTimers()
    const s = setup()
    const d = s.connect()
    vi.advanceTimersByTime(10_000)
    expect(d.ext.closed?.reason).toBe('handshake timeout')
  })

  it('lets a pending device wait 15 minutes, then closes it', () => {
    vi.useFakeTimers()
    const s = setup()
    const d = s.connect().hello().prove(s.serverKey.publicKey)
    vi.advanceTimersByTime(14 * 60_000)
    expect(d.ext.closed).toBeUndefined()
    vi.advanceTimersByTime(60_000)
    expect(d.ext.closed?.reason).toBe('not approved in time')
  })

  it('rejects a capability list with a bad name, tier or schema', () => {
    const s = setup()
    const bad = [{ name: 'Bad Name', tier: 'observe', description: '', input: {} }, { name: 'x', tier: 'god', description: '', input: {} }]
    for (const items of bad) {
      const d = s.connect().hello().prove(s.serverKey.publicKey)
      s.store.approveExecutorKey(s.store.executorByKey(d.pub)!.device.id)
      s.gateway.admit(s.store.executorByKey(d.pub)!.device.id)
      d.announce([items])
      expect(d.ext.closed?.code).toBe(1008)
    }
  })
})

describe('calls', () => {
  it('sends a call and resolves with the text of the result', async () => {
    const s = setup()
    const { d } = online(s)
    const p = s.gateway.find('win-lan').call('window_list', {})
    expect(d.last()).toMatchObject({ type: 'call', id: 'c-1', capability: 'window_list' })
    d.ext.say({ type: 'result', id: 'c-1', ok: true, text: '3 windows' })
    await expect(p).resolves.toEqual({ text: '3 windows', image: undefined })
  })

  it('carries a PNG back as bytes', async () => {
    const s = setup()
    const { d } = online(s)
    const p = s.gateway.find('win-lan').call('window_list', {})
    d.ext.say({ type: 'result', id: 'c-1', ok: true, text: 'shot', image_png_base64: b64(Buffer.from([1, 2, 3])) })
    expect((await p).image).toEqual(Buffer.from([1, 2, 3]))
  })

  it('turns an error result into a failure with the executor reason', async () => {
    const s = setup()
    const { d } = online(s)
    const p = s.gateway.find('win-lan').call('process_kill', { pid: 4 })
    d.ext.say({ type: 'result', id: 'c-1', ok: false, error: 'pid 4 is protected' })
    await expect(p).rejects.toThrow('pid 4 is protected')
  })

  it('times out, and fails what is waiting when the device goes', async () => {
    vi.useFakeTimers()
    const s = setup()
    const { d } = online(s)
    const conn = s.gateway.find('win-lan')
    const slow = conn.call('window_list', {}, 5000)
    const caught = slow.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5000)
    expect(String(await caught)).toMatch(/did not answer in 5s/)
    const waiting = conn.call('window_list', {})
    const lost = waiting.catch((e: unknown) => e)
    d.ext.emit('close')
    expect(String(await lost)).toMatch(/disconnected/)
    expect(s.gateway.list()).toHaveLength(0)
  })

  it('does not tell two devices with one name apart by guessing', () => {
    const s = setup()
    online(s)
    online(s)
    expect(() => s.gateway.find('win-lan')).toThrow(/Two devices/)
    expect(() => s.gateway.find('mac')).toThrow(/No device called "mac"/)
  })
})

describe('revocation, silence and the kill switch', () => {
  it('closes a revoked device on the next sweep', () => {
    const s = setup()
    const { d, device } = online(s)
    s.gateway.sweep()
    expect(d.ext.closed).toBeUndefined()
    s.store.revoke(device.id)
    s.gateway.sweep()
    expect(d.ext.closed?.code).toBe(4001)
  })

  it('closes a device that went quiet for 90 seconds, and keeps one that sends heartbeats', () => {
    vi.useFakeTimers()
    const s = setup()
    const { d } = online(s)
    vi.advanceTimersByTime(80_000)
    d.ext.say({ type: 'heartbeat' })
    vi.advanceTimersByTime(80_000)
    s.gateway.sweep()
    expect(d.ext.closed).toBeUndefined()
    vi.advanceTimersByTime(20_000)
    s.gateway.sweep()
    expect(d.ext.closed?.code).toBe(4002)
  })

  it('is cut by the kill switch, which refuses new executors until resumed', () => {
    const s = setup()
    const { d } = online(s)
    expect(s.killSwitch.engage()).toBe(1)
    expect(d.ext.closed?.code).toBe(1008)
    const late = s.connect()
    expect(late.ext.closed?.reason).toBe('kill switch')
  })

  it('disconnects a waiting device when it is revoked', () => {
    const s = setup()
    const d = s.connect().hello().prove(s.serverKey.publicKey)
    const device = s.store.executorByKey(d.pub)!.device
    s.gateway.disconnect(device.id, 'revoked')
    expect(d.ext.closed?.code).toBe(4001)
  })
})
