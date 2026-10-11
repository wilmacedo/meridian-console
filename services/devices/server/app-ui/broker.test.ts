import { describe, expect, it, vi } from 'vitest'
import { createBroker, type BrokerDeps } from './broker.js'

const cfg = { sshHost: 'win', closedHint: 'Start the app with the debug option.', idleMs: 1000, tunnelWaitMs: 1000, pollMs: 100 }

function setup(over: Partial<{ reachable: boolean[]; portOpen: boolean[]; tunnelAlive: boolean }> = {}) {
  const reachable = [...(over.reachable ?? [true])]
  const portOpen = [...(over.portOpen ?? [true])]
  const killed = vi.fn()
  const started = vi.fn()
  const deps: BrokerDeps = {
    reachable: async () => (reachable.length > 1 ? reachable.shift()! : reachable[0]),
    portOpen: async () => (portOpen.length > 1 ? portOpen.shift()! : portOpen[0]),
    startTunnel: () => (started(), { alive: () => over.tunnelAlive ?? true, kill: killed, lastError: () => 'ssh: connect to host win port 22: Connection refused\n' }),
    sleep: async () => undefined,
    log: () => undefined,
  }
  return { deps, killed, started }
}

describe('app tunnel broker', () => {
  it('does nothing when the debug port already answers', async () => {
    const { deps, started } = setup()
    await createBroker(cfg, deps).ensure()
    expect(started).not.toHaveBeenCalled()
  })

  it('opens the tunnel when the local port is closed and reports ready once the app answers', async () => {
    const { deps, started } = setup({ reachable: [false, true], portOpen: [false, true] })
    const broker = createBroker(cfg, deps)
    await broker.ensure()
    expect(started).toHaveBeenCalledOnce()
    expect(broker.tunnel()).toBe('ours')
  })

  it('says how to open the port when the tunnel is up but the app is not listening', async () => {
    const { deps } = setup({ reachable: [false], portOpen: [false, true] })
    await expect(createBroker(cfg, deps).ensure()).rejects.toThrow('not listening on its debug port. Start the app with the debug option.')
  })

  it('explains an ssh failure and drops the tunnel', async () => {
    const { deps, killed } = setup({ reachable: [false], portOpen: [false], tunnelAlive: false })
    await expect(createBroker(cfg, deps).ensure()).rejects.toThrow(/Could not open the ssh tunnel to win: ssh: connect to host win port 22/)
    expect(killed).toHaveBeenCalled()
  })

  it('does not touch a tunnel started by hand', async () => {
    const { deps, started, killed } = setup({ reachable: [false, true], portOpen: [true] })
    const broker = createBroker(cfg, deps)
    await broker.ensure()
    expect(started).not.toHaveBeenCalled()
    broker.stop()
    expect(killed).not.toHaveBeenCalled()
    expect(broker.tunnel()).toBe('external')
  })

  it('closes its own tunnel after a quiet spell', async () => {
    vi.useFakeTimers()
    const { deps, killed } = setup({ reachable: [false, true], portOpen: [false, true] })
    await createBroker(cfg, deps).ensure()
    vi.advanceTimersByTime(1000)
    expect(killed).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('without an ssh host, reports the closed port instead of guessing', async () => {
    const { deps } = setup({ reachable: [false] })
    await expect(createBroker({ ...cfg, sshHost: undefined }, deps).ensure()).rejects.toThrow(/no ssh host is set/)
  })
})
