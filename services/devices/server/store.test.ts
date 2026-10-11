import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { DeviceStore, sha256 } from './store.js'

const make = () => {
  const clock = { now: 1_000_000 }
  const db = new DatabaseSync(':memory:')
  return { db, clock, store: new DeviceStore(db, () => clock.now) }
}

describe('pairing links', () => {
  it('works once, and only once', () => {
    const { store } = make()
    const { link } = store.createPairingLink()
    expect(store.consumePairingLink(link)).toBe(true)
    expect(store.consumePairingLink(link)).toBe(false)
  })

  it('expires after five minutes', () => {
    const { store, clock } = make()
    const { link, expiresAt } = store.createPairingLink()
    expect(expiresAt - clock.now).toBe(5 * 60_000)
    clock.now = expiresAt
    expect(store.consumePairingLink(link)).toBe(false)
  })

  it('rejects a link it never issued', () => {
    expect(make().store.consumePairingLink('nope')).toBe(false)
  })

  it('keeps only the hash', () => {
    const { db, store } = make()
    const { link } = store.createPairingLink()
    const rows = db.prepare('SELECT hash FROM device_pairing_links').all()
    expect(rows).toEqual([{ hash: sha256(link) }])
  })
})

describe('devices', () => {
  it('finds a device by its token and keeps only the token hash', () => {
    const { db, store } = make()
    const device = store.addDevice('browser', 'personal', 'secret-token', null)
    expect(store.deviceByToken('secret-token')?.id).toBe(device.id)
    expect(JSON.stringify(db.prepare('SELECT * FROM devices').all())).not.toContain('secret-token')
  })

  it('stops honouring an expired token', () => {
    const { store, clock } = make()
    store.addDevice('browser', 'personal', 't', clock.now + 90 * 86_400_000)
    clock.now += 90 * 86_400_000
    expect(store.deviceByToken('t')).toBeUndefined()
  })

  it('revoking removes the token and the executor key', () => {
    const { store } = make()
    const device = store.addDevice('executor', 'pc', 't', null)
    store.addExecutorKey(device.id, 'pub')
    expect(store.revoke(device.id)).toBe(true)
    expect(store.deviceByToken('t')).toBeUndefined()
    expect(store.executorKey(device.id)).toBeUndefined()
    expect(store.devices()).toEqual([])
    expect(store.revoke(device.id)).toBe(false)
  })

  it('holds a new executor key until it is approved', () => {
    const { store } = make()
    const device = store.addDevice('executor', 'pc', 't', null)
    store.addExecutorKey(device.id, 'pub')
    expect(store.executorKey(device.id)?.approvedAt).toBeNull()
    expect(store.approveExecutorKey(device.id)).toBe(true)
    expect(store.executorKey(device.id)?.approvedAt).not.toBeNull()
  })
})
