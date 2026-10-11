import { EventEmitter } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KillSwitch } from '../kill-switch.js'
import { DeviceStore } from '../store.js'
import { BrowserGateway, RpcFailure, type Socket } from './gateway.js'

// Stands in for the extension: speaks the protocol from its side of the socket.
class FakeExtension extends EventEmitter {
  sent: Record<string, unknown>[] = []
  closed?: { code?: number; reason?: string }
  readonly socket: Socket = {
    send: (data) => {
      const frame = JSON.parse(data) as Record<string, unknown>
      this.sent.push(frame)
      this.emit('frame', frame)
    },
    close: (code, reason) => {
      this.closed = { code, reason }
      queueMicrotask(() => this.emit('close'))
    },
    on: ((event: string, cb: never) => this.on(event, cb as (...a: unknown[]) => void)) as Socket['on'],
  }
  say(frame: unknown): void {
    this.emit('message', JSON.stringify(frame))
  }
  hello(label = 'personal', over: Record<string, unknown> = {}): void {
    this.say({ id: 'hs-1', method: 'system.handshake', params: { client: 'browser-skill-extension', version: '0.1.0', protocol_version: '1.3', instance_id: 'i', browser: { name: 'chrome', version: '154' }, label, min_compatible_protocol: '1.0', ...over } })
  }
}

const setup = (maxConnections?: number) => {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const killSwitch = new KillSwitch(store)
  const gateway = new BrowserGateway({ store, killSwitch, maxConnections })
  const connect = (label = 'personal', device = store.addDevice('browser', 'browser', `t-${Math.random()}`, null)) => {
    const ext = new FakeExtension()
    gateway.attach(ext.socket, device)
    ext.hello(label)
    return { ext, device }
  }
  return { store, killSwitch, gateway, connect }
}

afterEach(() => vi.useRealTimers())

describe('handshake', () => {
  it('answers with the protocol version and lists the browser under the label from the popup', () => {
    const { gateway, connect } = setup()
    const { ext } = connect('work')
    expect(ext.sent[0]).toMatchObject({ id: 'hs-1', result: { protocol_version: '1.3', server: 'meridian-devices' } })
    expect(gateway.byProfile('Work').hello.browser.name).toBe('chrome')
  })

  it('refuses an incompatible protocol with version_too_old and closes', () => {
    const { gateway, store } = setup()
    const ext = new FakeExtension()
    gateway.attach(ext.socket, store.addDevice('browser', 'b', 't', null))
    ext.hello('personal', { protocol_version: '2.0', min_compatible_protocol: '2.0' })
    expect(ext.sent[0]).toMatchObject({ error: { code: 'version_too_old' } })
    expect(ext.closed?.code).toBe(1008)
    expect(gateway.list()).toHaveLength(0)
  })

  it('closes a first frame that is not a handshake', () => {
    const { gateway, store } = setup()
    const ext = new FakeExtension()
    gateway.attach(ext.socket, store.addDevice('browser', 'b', 't', null))
    ext.say({ id: '1', method: 'tool.click', params: {} })
    expect(ext.closed?.code).toBe(1008)
  })

  it('closes a socket that never handshakes', () => {
    vi.useFakeTimers()
    const { gateway, store } = setup()
    const ext = new FakeExtension()
    gateway.attach(ext.socket, store.addDevice('browser', 'b', 't', null))
    vi.advanceTimersByTime(10_000)
    expect(ext.closed?.reason).toBe('handshake timeout')
  })

  it('lets a reconnect replace the old socket of the same device', () => {
    const { gateway, connect } = setup()
    const first = connect('personal')
    const second = connect('personal', first.device)
    expect(first.ext.closed?.code).toBe(4000)
    expect(gateway.list()).toHaveLength(1)
    first.ext.emit('close')
    expect(gateway.list()).toHaveLength(1)
    expect(second.ext.closed).toBeUndefined()
  })

  it('refuses a new device at capacity but lets a known one in', () => {
    const { gateway, store, connect } = setup(1)
    const a = connect('a')
    const late = new FakeExtension()
    gateway.attach(late.socket, store.addDevice('browser', 'b', 'other', null))
    expect(late.closed?.code).toBe(1013)
    connect('a', a.device)
    expect(gateway.list()).toHaveLength(1)
  })

  it('does not tell two browsers with the same label apart by guessing', () => {
    const { gateway, connect } = setup()
    connect('personal')
    connect('personal')
    expect(() => gateway.byProfile('personal')).toThrow(/Two browsers/)
    expect(() => gateway.byProfile('nope')).toThrow(/No browser called "nope"/)
  })
})

describe('calls', () => {
  const echo = (ext: FakeExtension, handler: (f: Record<string, unknown>) => unknown) =>
    ext.on('frame', (f: Record<string, unknown>) => {
      if (typeof f.method === 'string' && f.method.startsWith('tool.')) queueMicrotask(() => ext.say({ id: f.id, result: handler(f) }))
    })

  it('matches a response to its request by id', async () => {
    const { gateway, connect } = setup()
    const { ext } = connect()
    echo(ext, () => ({ ok: true, tab_id: 7, value: 'hi' }))
    await expect(gateway.byProfile('personal').call('tool.evaluate', { session_id: 'abcd', expression: '1' })).resolves.toMatchObject({ value: 'hi' })
  })

  it('turns an error frame into an RpcFailure with its reason', async () => {
    const { gateway, connect } = setup()
    const { ext } = connect()
    ext.on('frame', (f: Record<string, unknown>) => {
      if (f.method === 'tool.click') queueMicrotask(() => ext.say({ id: f.id, error: { code: 'not_found', message: 'no such ref', data: { reason: 'ref_not_found' } } }))
    })
    await expect(gateway.byProfile('personal').call('tool.click', { session_id: 'abcd', ref: 'e1' })).rejects.toMatchObject({ code: 'not_found', reason: 'ref_not_found' })
  })

  it('runs one call at a time within a session, and sessions in parallel', async () => {
    const { gateway, connect } = setup()
    const { ext } = connect()
    const seen: string[] = []
    ext.on('frame', (f: Record<string, unknown>) => {
      if (typeof f.method === 'string' && f.method.startsWith('tool.')) seen.push(`${(f.params as { session_id: string }).session_id}:${f.id}`)
    })
    const conn = gateway.byProfile('personal')
    const a1 = conn.call('tool.click', { session_id: 'aaaa' })
    const a2 = conn.call('tool.click', { session_id: 'aaaa' })
    const b1 = conn.call('tool.click', { session_id: 'bbbb' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual(['aaaa:g-1', 'bbbb:g-2'])
    ext.say({ id: 'g-1', result: {} })
    await a1
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual(['aaaa:g-1', 'bbbb:g-2', 'aaaa:g-3'])
    ext.say({ id: 'g-2', result: {} })
    ext.say({ id: 'g-3', result: {} })
    await Promise.all([a2, b1])
  })

  it('times out, tells the extension to cancel, and lets the next call run', async () => {
    vi.useFakeTimers()
    const { gateway, connect } = setup()
    const { ext } = connect()
    const conn = gateway.byProfile('personal')
    const slow = conn.call('tool.navigate', { session_id: 'abcd', url: 'https://x.test' }, 5_000)
    const caught = slow.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await caught).toBeInstanceOf(RpcFailure)
    expect(ext.sent.at(-1)).toMatchObject({ method: 'cancel', params: { rpc_id: 'g-1' } })
    const next = conn.call('tool.click', { session_id: 'abcd' })
    await vi.advanceTimersByTimeAsync(0)
    ext.say({ id: 'g-3', result: {} })
    await expect(next).resolves.toEqual({})
  })

  it('fails what is waiting when the browser disconnects', async () => {
    const { gateway, connect } = setup()
    const { ext } = connect()
    const waiting = gateway.byProfile('personal').call('tool.click', { session_id: 'abcd' })
    ext.emit('close')
    await expect(waiting).rejects.toMatchObject({ code: 'cancelled' })
    expect(gateway.list()).toHaveLength(0)
  })

  it('answers a request from the extension with unknown_method instead of leaving it hanging', () => {
    const { connect } = setup()
    const { ext } = connect()
    ext.say({ id: 'x-1', method: 'system.whatever' })
    expect(ext.sent.at(-1)).toMatchObject({ id: 'x-1', error: { code: 'unknown_method' } })
  })
})

describe('revocation', () => {
  it('closes the socket of a revoked device on the next sweep', () => {
    const { gateway, store, connect } = setup()
    const { ext, device } = connect()
    gateway.sweep()
    expect(ext.closed).toBeUndefined()
    store.revoke(device.id)
    gateway.sweep()
    expect(ext.closed?.code).toBe(4001)
  })

  it('closes it within a second when the sweep is running', () => {
    vi.useFakeTimers()
    const { gateway, store, connect } = setup()
    const { ext, device } = connect()
    gateway.start()
    store.revoke(device.id)
    vi.advanceTimersByTime(1_000)
    expect(ext.closed?.code).toBe(4001)
    gateway.stop()
  })

  it('is cut by the kill switch, which then refuses new sockets', () => {
    const { killSwitch, gateway, store, connect } = setup()
    const { ext } = connect()
    expect(killSwitch.engage()).toBe(1)
    expect(ext.closed?.code).toBe(1008)
    const late = new FakeExtension()
    gateway.attach(late.socket, store.addDevice('browser', 'b', 'late', null))
    expect(late.closed?.reason).toBe('kill switch')
  })
})
