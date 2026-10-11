import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { DatabaseSync } from 'node:sqlite'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { KillSwitch } from '../kill-switch.js'
import { DeviceStore } from '../store.js'
import { BrowserGateway } from './gateway.js'
import { browserRoutes } from './routes.js'

const ORIGIN = 'chrome-extension://abcdefghijklmnop'
const token = (c: string) => c.repeat(43)

let close: (() => Promise<void>) | undefined
afterEach(async () => close?.())

async function boot() {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const gateway = new BrowserGateway({ store, killSwitch: new KillSwitch(store) })
  const app = Fastify()
  await app.register(websocket)
  await app.register(browserRoutes(store, gateway), { prefix: '/api/services/devices' })
  await app.listen({ port: 0, host: '127.0.0.1' })
  close = () => app.close()
  const base = `127.0.0.1:${(app.server.address() as AddressInfo).port}/api/services/devices/extension`
  const pair = async (next = token('a')) => {
    const res = await fetch(`http://${base}/authorize`, { method: 'POST', headers: { Authorization: `Bearer ${store.createPairingLink().link}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pair', next_token: next, label: 'Chrome' }) })
    return { res, body: (await res.json()) as Record<string, string> }
  }
  const open = (protocols: string[], origin: string | undefined = ORIGIN) => new WebSocket(`ws://${base}`, protocols, { origin })
  return { store, gateway, base, pair, open }
}

// Resolves with how the upgrade ended: connected, or the HTTP status that refused it.
const outcome = (ws: WebSocket): Promise<'open' | number> =>
  new Promise((resolve) => {
    ws.on('open', () => resolve('open'))
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
    ws.on('error', () => undefined)
  })

describe('the extension endpoints, end to end', () => {
  it('pairs over HTTP, then connects over WebSocket with the token as the subprotocol and gets the handshake', async () => {
    const { pair, open, gateway } = await boot()
    const { res, body } = await pair()
    expect(res.status).toBe(200)
    expect(body.device_id).toMatch(/^[a-f0-9]{32}$/)

    const ws = open([`bsk-auth.${token('a')}`])
    const reply = new Promise<Record<string, unknown>>((resolve) => ws.on('message', (d) => resolve(JSON.parse(d.toString()))))
    await new Promise((r) => ws.on('open', r))
    expect(ws.protocol).toBe(`bsk-auth.${token('a')}`)
    ws.send(JSON.stringify({ id: 'hs-1', method: 'system.handshake', params: { client: 'c', version: '1', protocol_version: '1.3', instance_id: 'i', browser: { name: 'brave', version: '1' }, label: 'personal' } }))
    expect(await reply).toMatchObject({ id: 'hs-1', result: { protocol_version: '1.3' } })
    expect(gateway.byProfile('personal').device.id).toBe(body.device_id)
    ws.close()
  })

  it('refuses the upgrade without a valid token, with a wrong origin, or with two credentials', async () => {
    const { pair, open } = await boot()
    await pair()
    expect(await outcome(open([`bsk-auth.${token('z')}`]))).toBe(401)
    expect(await outcome(open([`bsk-auth.${token('a')}`], 'https://evil.test'))).toBe(401)
    expect(await outcome(open([`bsk-auth.${token("a")}`, `bsk-auth.${token("z")}`]))).toBe(401)
    expect(await outcome(open(['plain']))).toBe(401)
  })

  it('refuses the old token after a renewal', async () => {
    const { pair, open, base } = await boot()
    await pair()
    const renew = await fetch(`http://${base}/authorize`, { method: 'POST', headers: { Authorization: `Bearer ${token('a')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'renew', next_token: token('b') }) })
    expect(renew.status).toBe(200)
    expect(await outcome(open([`bsk-auth.${token('a')}`]))).toBe(401)
    expect(await outcome(open([`bsk-auth.${token('b')}`]))).toBe('open')
  })

  it('answers a bad exchange with 401 and no store of the secret', async () => {
    const { base } = await boot()
    const res = await fetch(`http://${base}/authorize`, { method: 'POST', headers: { Authorization: `Bearer ${'q'.repeat(40)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pair', next_token: token('a') }) })
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
