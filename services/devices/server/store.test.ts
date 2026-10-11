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

  it('revoking removes the token', () => {
    const { store } = make()
    const device = store.addDevice('browser', 'pc', 't', null)
    expect(store.revoke(device.id)).toBe(true)
    expect(store.deviceByToken('t')).toBeUndefined()
    expect(store.devices()).toEqual([])
    expect(store.revoke(device.id)).toBe(false)
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

describe('executors', () => {
  it('enrolls a new executor as pending, with no token', () => {
    const { store } = make()
    const device = store.addExecutor('win-lan', 'KEY1')
    expect(device.kind).toBe('executor')
    expect(store.executorByKey('KEY1')).toMatchObject({ device: { id: device.id }, approvedAt: null })
    expect(store.pendingExecutors().map((d) => d.id)).toEqual([device.id])
    expect(store.devices().map((d) => d.id)).toContain(device.id)
  })

  it('moves out of pending when approved', () => {
    const { store } = make()
    const device = store.addExecutor('win-lan', 'KEY1')
    expect(store.approveExecutorKey(device.id)).toBe(true)
    expect(store.approveExecutorKey(device.id)).toBe(false)
    expect(store.executorByKey('KEY1')?.approvedAt).not.toBeNull()
    expect(store.pendingExecutors()).toEqual([])
  })

  it('remembers a revoked key so it can never enroll again', () => {
    const { store } = make()
    const device = store.addExecutor('win-lan', 'KEY1')
    store.approveExecutorKey(device.id)
    store.revoke(device.id)
    expect(store.executorByKey('KEY1')?.device.revokedAt).not.toBeNull()
    expect(() => store.addExecutor('again', 'KEY1')).toThrow()
    expect(store.pendingExecutors()).toEqual([])
  })

  it('forgets a device that left without being approved, and keeps one that was', () => {
    const { store } = make()
    const waiting = store.addExecutor('stranger', 'KEY1')
    store.dropUnapproved(waiting.id)
    expect(store.executorByKey('KEY1')).toBeUndefined()
    expect(store.pendingExecutors()).toEqual([])
    const approved = store.addExecutor('pc', 'KEY2')
    store.approveExecutorKey(approved.id)
    store.dropUnapproved(approved.id)
    expect(store.executorByKey('KEY2')?.device.id).toBe(approved.id)
  })

  it('keeps the record of a waiting device that was revoked, so its key stays out', () => {
    const { store } = make()
    const waiting = store.addExecutor('stranger', 'KEY1')
    store.revoke(waiting.id)
    store.dropUnapproved(waiting.id)
    expect(store.executorByKey('KEY1')?.device.revokedAt).not.toBeNull()
    expect(() => store.addExecutor('again', 'KEY1')).toThrow()
  })

  it('does not tell a key from an unknown one', () => {
    expect(make().store.executorByKey('nope')).toBeUndefined()
  })
})
