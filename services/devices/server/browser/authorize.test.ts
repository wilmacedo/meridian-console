import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { DeviceStore } from '../store.js'
import { authorize, RateLimiter } from './authorize.js'

const token = (c: string) => c.repeat(43)
const make = () => {
  const clock = { now: 1_700_000_000_000 }
  const store = new DeviceStore(new DatabaseSync(':memory:'), () => clock.now)
  const limiter = new RateLimiter(60, () => clock.now)
  const call = (bearer: string | undefined, body: unknown, peer = '1.1.1.1') => authorize(store, limiter, peer, bearer === undefined ? undefined : `Bearer ${bearer}`, body, () => clock.now)
  return { clock, store, limiter, call }
}

describe('POST /authorize', () => {
  it('pairs once with a fresh link and answers with a 32-hex device id and the token lifetimes', () => {
    const { store, call, clock } = make()
    const { link } = store.createPairingLink()
    const reply = call(link, { action: 'pair', next_token: token('a'), label: 'Chrome' })
    expect(reply.status).toBe(200)
    expect(reply.body.device_id).toMatch(/^[a-f0-9]{32}$/)
    expect(Date.parse(reply.body.expires_at as string) - clock.now).toBe(90 * 86_400_000)
    expect(Date.parse(reply.body.renew_after as string) - clock.now).toBe(30 * 86_400_000)
    expect(store.deviceByToken(token('a'))?.id).toBe(reply.body.device_id)
    expect(call(link, { action: 'pair', next_token: token('b') }).status).toBe(401)
  })

  it('refuses an expired link and one it never issued', () => {
    const { store, call, clock } = make()
    const { link } = store.createPairingLink()
    clock.now += 5 * 60_000
    expect(call(link, { action: 'pair', next_token: token('a') }).status).toBe(401)
    expect(call('x'.repeat(40), { action: 'pair', next_token: token('a') }).status).toBe(401)
  })

  it('renews with the current token and keeps the device id', () => {
    const { store, call } = make()
    const paired = call(store.createPairingLink().link, { action: 'pair', next_token: token('a') })
    const renewed = call(token('a'), { action: 'renew', next_token: token('b') })
    expect(renewed.status).toBe(200)
    expect(renewed.body.device_id).toBe(paired.body.device_id)
    expect(call(token('a'), { action: 'renew', next_token: token('b') }).status).toBe(200)
    expect(call(token('a'), { action: 'renew', next_token: token('c') }).status).toBe(401)
  })

  it('rejects a pairing secret as a renewal credential and malformed requests', () => {
    const { store, call } = make()
    const { link } = store.createPairingLink()
    expect(call(link, { action: 'renew', next_token: token('a') }).status).toBe(401)
    expect(call(undefined, { action: 'pair', next_token: token('a') }).status).toBe(400)
    expect(call(link, { action: 'pair', next_token: 'short' }).status).toBe(400)
    expect(call(link, { action: 'nope', next_token: token('a') }).status).toBe(400)
    expect(call(link, null).status).toBe(400)
  })

  it('rate limits per peer and recovers after a minute', () => {
    const { call, clock } = make()
    for (let i = 0; i < 60; i++) expect(call('x'.repeat(40), {}, 'peer').status).toBe(400)
    expect(call('x'.repeat(40), {}, 'peer').status).toBe(429)
    expect(call('x'.repeat(40), {}, 'other').status).toBe(400)
    clock.now += 60_000
    expect(call('x'.repeat(40), {}, 'peer').status).toBe(400)
  })
})
