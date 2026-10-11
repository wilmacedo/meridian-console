import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { KillSwitch } from './kill-switch.js'
import { DeviceStore } from './store.js'

const make = () => {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  return { store, ks: new KillSwitch(store) }
}
const fakeSocket = () => ({ close: vi.fn() })

describe('KillSwitch', () => {
  it('closes every connected socket when engaged', () => {
    const { ks } = make()
    const a = fakeSocket()
    const b = fakeSocket()
    ks.admit(a)
    ks.admit(b)
    expect(ks.engage()).toBe(2)
    expect(a.close).toHaveBeenCalledOnce()
    expect(b.close).toHaveBeenCalledOnce()
  })

  it('refuses new sockets until resumed', () => {
    const { ks } = make()
    ks.engage()
    const late = fakeSocket()
    expect(ks.admit(late)).toBe(false)
    expect(late.close).toHaveBeenCalledOnce()
    ks.resume()
    const next = fakeSocket()
    expect(ks.admit(next)).toBe(true)
    expect(next.close).not.toHaveBeenCalled()
  })

  it('stays on across a restart', () => {
    const { store, ks } = make()
    ks.engage()
    expect(new KillSwitch(store).engaged()).toBe(true)
  })

  it('does not close a socket that already left', () => {
    const { ks } = make()
    const gone = fakeSocket()
    ks.admit(gone)
    ks.release(gone)
    expect(ks.engage()).toBe(0)
    expect(gone.close).not.toHaveBeenCalled()
  })
})
