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

describe('token rotation', () => {
  const day = 86_400_000

  it('replaces the credential and drops the old one', () => {
    const { store, clock } = make()
    const device = store.addDevice('browser', 'personal', 'old', clock.now + 90 * day)
    expect(store.rotateToken('old', 'next', clock.now + 90 * day)?.id).toBe(device.id)
    expect(store.deviceByToken('old')).toBeUndefined()
    expect(store.deviceByToken('next')?.id).toBe(device.id)
  })

  it('answers an exact retry again but never rotates the old token to another replacement', () => {
    const { store, clock } = make()
    store.addDevice('browser', 'personal', 'old', clock.now + 90 * day)
    store.rotateToken('old', 'next', clock.now + 90 * day)
    expect(store.rotateToken('old', 'next', clock.now + 90 * day)).toBeDefined()
    expect(store.rotateToken('old', 'other', clock.now + 90 * day)).toBeUndefined()
  })

  it('refuses a revoked device, even for a retry', () => {
    const { store, clock } = make()
    const device = store.addDevice('browser', 'personal', 'old', clock.now + 90 * day)
    store.rotateToken('old', 'next', clock.now + 90 * day)
    store.revoke(device.id)
    expect(store.rotateToken('old', 'next', clock.now + 90 * day)).toBeUndefined()
    expect(store.active(device.id)).toBe(false)
  })

  it('stops being active when the grant lapses', () => {
    const { store, clock } = make()
    const device = store.addDevice('browser', 'personal', 't', clock.now + day)
    expect(store.active(device.id)).toBe(true)
    clock.now += day
    expect(store.active(device.id)).toBe(false)
  })
})
