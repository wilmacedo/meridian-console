import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { AuditLog } from '../audit.js'
import { KillSwitch } from '../kill-switch.js'
import { DeviceStore } from '../store.js'
import { ExecutorGateway } from './gateway.js'
import { b64, ServerKey } from './keys.js'
import { CAPS, Device } from './test-support.js'
import { ExecutorTools } from './tools.js'

const capabilities = [...CAPS, { name: 'clipboard_write', tier: 'act', description: 'Put text on the clipboard', input: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } }, { name: 'screenshot', tier: 'observe', description: 'Take a screenshot', input: { type: 'object', properties: {} } }]

function setup() {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const serverKey = ServerKey.fromPrivate(generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer)
  const gateway = new ExecutorGateway({ store, killSwitch: new KillSwitch(store), serverKey })
  const dir = mkdtempSync(join(tmpdir(), 'exec-tools-'))
  const tools = new ExecutorTools(gateway, store, new AuditLog(join(dir, 'audit.log')), join(dir, 'screens'), () => ({ url: 'wss://h/api/services/devices/executor', serverKey: serverKey.publicKey }))
  const d = new Device()
  gateway.attach(d.ext.socket)
  d.hello().prove(serverKey.publicKey)
  const device = store.executorByKey(d.pub)!.device
  store.approveExecutorKey(device.id)
  gateway.admit(device.id)
  d.announce(capabilities)
  // Answers every call the way the executor would.
  const answer = (reply: (cap: string, input: Record<string, unknown>) => Record<string, unknown>) =>
    d.ext.on('frame', (f: { type?: string; id: string; capability: string; input: Record<string, unknown> }) => {
      if (f.type === 'call') queueMicrotask(() => d.ext.say({ type: 'result', id: f.id, ok: true, text: 'done', ...reply(f.capability, f.input) }))
    })
  return { store, gateway, tools, d, device, dir, answer, serverKey }
}

const yes = vi.fn(async () => true)
const no = vi.fn(async () => false)

describe('device_list and describe', () => {
  it('lists connected devices with their capabilities, marking what changes things, and those waiting', () => {
    const s = setup()
    const waiting = new Device()
    s.gateway.attach(waiting.ext.socket)
    waiting.hello({ name: 'mac' }).prove(s.serverKey.publicKey)
    const out = s.tools.list()
    expect(out).toContain('win-lan (windows')
    expect(out).toContain('window_list, process_kill!, clipboard_write*')
    expect(out).toContain('waiting for approval: mac')
  })

  it('says so when nothing is connected', () => {
    const store = new DeviceStore(new DatabaseSync(':memory:'))
    const serverKey = ServerKey.fromPrivate(generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer)
    const gateway = new ExecutorGateway({ store, killSwitch: new KillSwitch(store), serverKey })
    expect(new ExecutorTools(gateway, store, new AuditLog(join(mkdtempSync(join(tmpdir(), 'x-')), 'a.log')), '/nowhere', () => ({ serverKey: '' })).list()).toBe('No device is connected.')
  })

  it('describes the inputs of what a device can do', () => {
    expect(setup().tools.describe('win-lan')).toContain('process_kill [irreversible] Kill a process\n  input: {"type":"object","required":["pid"]')
  })

  it('gives what an executor needs to enroll: the address and the key to pin', () => {
    const out = setup().tools.enroll()
    expect(out).toContain('wss://h/api/services/devices/executor')
    expect(out).toContain('pins this')
  })
})

describe('device_call', () => {
  it('runs an observe capability without asking and marks the answer as data', async () => {
    const s = setup()
    s.answer(() => ({ text: '2 windows' }))
    const confirm = vi.fn(yes)
    const out = await s.tools.call({ device: 'win-lan', capability: 'window_list' }, confirm)
    expect(out).toContain('2 windows')
    expect(out).toMatch(/^\[Text below comes from a page, an app or a device and was written by others/)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('runs an act capability without asking, and returns its confirmation as it is', async () => {
    const s = setup()
    s.answer(() => ({ text: 'Clipboard set (5 characters).' }))
    expect(await s.tools.call({ device: 'win-lan', capability: 'clipboard_write', input: { text: 'hello' } }, no)).toBe('Clipboard set (5 characters).')
  })

  it('always asks before an irreversible capability, and sends nothing when the owner declines', async () => {
    const s = setup()
    s.answer(() => ({}))
    const confirm = vi.fn(no)
    await expect(s.tools.call({ device: 'win-lan', capability: 'process_kill', input: { pid: 1234 } }, confirm)).rejects.toThrow(/did not confirm/)
    expect(confirm).toHaveBeenCalledWith('win-lan: process_kill {"pid":1234} (cannot be undone)')
    expect(s.d.frames.some((f) => f.type === 'call')).toBe(false)
    await s.tools.call({ device: 'win-lan', capability: 'process_kill', input: { pid: 1234 } }, yes)
    expect(s.d.frames.filter((f) => f.type === 'call')).toHaveLength(1)
  })

  it('checks the input against the schema the device announced before sending anything', async () => {
    const s = setup()
    await expect(s.tools.call({ device: 'win-lan', capability: 'process_kill', input: { pid: 'x' } }, yes)).rejects.toThrow(/Bad input for process_kill/)
    await expect(s.tools.call({ device: 'win-lan', capability: 'process_kill', input: { pid: 1.5 } }, yes)).rejects.toThrow(/Bad input/)
    await expect(s.tools.call({ device: 'win-lan', capability: 'clipboard_write', input: {} }, yes)).rejects.toThrow(/Bad input/)
    expect(s.d.frames.some((f) => f.type === 'call')).toBe(false)
  })

  it('names what a device can do when asked for something it cannot', async () => {
    await expect(setup().tools.call({ device: 'win-lan', capability: 'launch_missiles' }, yes)).rejects.toThrow('has no capability "launch_missiles". It can: window_list, process_kill, clipboard_write, screenshot')
  })

  it('reports an unknown device with the ones that are connected', async () => {
    await expect(setup().tools.call({ device: 'mac', capability: 'window_list' }, yes)).rejects.toThrow('No device called "mac" is connected (connected: win-lan)')
  })

  it('passes on the executor reason when a call fails', async () => {
    const s = setup()
    s.d.ext.on('frame', (f: { type?: string; id: string }) => f.type === 'call' && queueMicrotask(() => s.d.ext.say({ type: 'result', id: f.id, ok: false, error: 'pid 1234 does not exist' })))
    await expect(s.tools.call({ device: 'win-lan', capability: 'process_kill', input: { pid: 1234 } }, yes)).rejects.toThrow('win-lan said: pid 1234 does not exist')
  })
})

describe('screenshots and the audit log', () => {
  it('saves the PNG privately and returns its path, never the bytes', async () => {
    const s = setup()
    s.answer(() => ({ text: '1920x1080', image_png_base64: b64(Buffer.from([137, 80, 78, 71])) }))
    const out = await s.tools.call({ device: 'win-lan', capability: 'screenshot' }, yes)
    const file = /saved at (\S+\.png)/.exec(out)![1]
    expect(readFileSync(file)).toEqual(Buffer.from([137, 80, 78, 71]))
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(out).not.toContain('iVBOR')
  })

  it('keeps only the latest screenshots', async () => {
    const s = setup()
    s.answer(() => ({ text: 'x', image_png_base64: b64(Buffer.from([1])) }))
    for (let i = 0; i < 23; i++) await s.tools.call({ device: 'win-lan', capability: 'screenshot' }, yes)
    expect(readdirSync(join(s.dir, 'screens'))).toHaveLength(20)
  })

  it('logs the device, the capability and the outcome, never the input', async () => {
    const s = setup()
    s.answer(() => ({}))
    await s.tools.call({ device: 'win-lan', capability: 'clipboard_write', input: { text: 'secret-text' } }, yes)
    await expect(s.tools.call({ device: 'win-lan', capability: 'process_kill', input: { pid: 99 } }, no)).rejects.toThrow()
    const log = readFileSync(join(s.dir, 'audit.log'), 'utf8')
    expect(log).not.toContain('secret-text')
    expect(log.trim().split('\n').map((l) => l.split(' ').slice(1).join(' '))).toEqual(['win-lan clipboard_write - ok', 'win-lan process_kill - declined'])
  })
})
