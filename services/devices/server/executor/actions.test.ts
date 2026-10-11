import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import type { Runtime } from '../runtime.js'
import { DeviceStore } from '../store.js'
import { executorActions } from './actions.js'

function setup() {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const executors = { admit: vi.fn(), disconnect: vi.fn() }
  const gateway = { disconnect: vi.fn() }
  const audit = { record: vi.fn() }
  const runtime = { store, executors, gateway, audit, executorTools: {} } as unknown as Runtime
  const run = (id: string, input: unknown, confirm: (d: string) => Promise<boolean>) =>
    (executorActions(runtime).find((a) => a.id === id) as unknown as { run: (i: unknown, c: { confirm: typeof confirm }) => Promise<unknown> }).run(input, { confirm })
  return { store, executors, gateway, run }
}

const no = async () => false
const yes = async () => true

describe('handing a machine to NOX', () => {
  it('needs the owner on screen: a caller with no screen is refused and nothing changes', async () => {
    const s = setup()
    const device = s.store.addExecutor('win-lan', 'KEY1')
    await expect(s.run('device_approve', { device: device.id }, no)).rejects.toThrow(/did not confirm/)
    expect(s.store.pendingExecutors()).toHaveLength(1)
    expect(s.executors.admit).not.toHaveBeenCalled()
  })

  it('says whom it is about when it asks, and lets the device in when the owner says yes', async () => {
    const s = setup()
    const device = s.store.addExecutor('win-lan', 'KEY1')
    const confirm = vi.fn(yes)
    await s.run('device_approve', { device: device.id }, confirm)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"win-lan"'))
    expect(s.store.pendingExecutors()).toEqual([])
    expect(s.executors.admit).toHaveBeenCalledWith(device.id)
  })

  it('refuses an id that is not waiting, without asking', async () => {
    const confirm = vi.fn(yes)
    await expect(setup().run('device_approve', { device: 'a'.repeat(32) }, confirm)).rejects.toThrow(/waiting for approval/)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('taking a machine away', () => {
  it('revokes and disconnects without asking: it only reduces what NOX can reach', async () => {
    const s = setup()
    const device = s.store.addExecutor('win-lan', 'KEY1')
    s.store.approveExecutorKey(device.id)
    const confirm = vi.fn(no)
    await s.run('device_revoke', { device: device.id }, confirm)
    expect(confirm).not.toHaveBeenCalled()
    expect(s.executors.disconnect).toHaveBeenCalledWith(device.id, 'revoked')
    expect(s.gateway.disconnect).toHaveBeenCalledWith(device.id, 'revoked')
    expect(s.store.executorByKey('KEY1')?.device.revokedAt).not.toBeNull()
  })
})
