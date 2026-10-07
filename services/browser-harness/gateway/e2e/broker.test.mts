// The broker's decisions, with the network faked. Run: node --experimental-strip-types --test broker.test.mts (Node 22+)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBroker, type BrokerConfig, type BrokerDeps } from '../../server/broker.ts'

const cfg: BrokerConfig = { sshHost: 'box', launchCommand: 'launch-chrome', idleMs: 60_000, tunnelWaitMs: 400, launchWaitMs: 400, pollMs: 100 }

function world(over: { chrome?: boolean; tunnel?: boolean; launchWorks?: boolean; tunnelWorks?: boolean; noHost?: boolean } = {}) {
  const w = { chrome: over.chrome ?? false, tunnel: over.tunnel ?? false, calls: [] as string[], killed: 0, alive: true }
  const deps: BrokerDeps = {
    reachable: async () => w.chrome && w.tunnel,
    portOpen: async () => w.tunnel,
    startTunnel: () => {
      w.calls.push('tunnel')
      if (over.tunnelWorks !== false) w.tunnel = true
      else w.alive = false
      return { alive: () => w.alive, kill: () => (w.killed++, (w.tunnel = false), (w.alive = false)), lastError: () => 'ssh: connect to host box port 22: No route to host' }
    },
    runRemote: async (c) => {
      w.calls.push(`remote:${c}`)
      if (over.launchWorks === false) throw new Error('schtasks: The system cannot find the file specified')
      w.chrome = true
    },
    sleep: async () => undefined,
    log: (e) => w.calls.push(`log:${e}`),
  }
  return { w, broker: createBroker({ ...cfg, sshHost: over.noHost ? undefined : 'box' }, deps) }
}

test('already up: does nothing', async () => {
  const { w, broker } = world({ chrome: true, tunnel: true })
  await broker.ensure()
  assert.deepEqual(w.calls, [])
})

test('cold: opens the tunnel, then starts Chrome, in that order', async () => {
  const { w, broker } = world()
  await broker.ensure()
  assert.deepEqual(w.calls.filter((c) => !c.startsWith('log:')), ['tunnel', 'remote:launch-chrome'])
  assert.equal(broker.tunnel(), 'ours')
})

test('a tunnel started by hand is used, not replaced', async () => {
  const { w, broker } = world({ tunnel: true })
  await broker.ensure()
  assert.ok(!w.calls.includes('tunnel'))
  assert.ok(w.calls.includes('remote:launch-chrome'))
  assert.equal(broker.tunnel(), 'external')
})

test('Chrome already running behind a tunnel that only needs opening: no launch', async () => {
  const { w, broker } = world({ chrome: true })
  await broker.ensure()
  assert.deepEqual(w.calls.filter((c) => !c.startsWith('log:')), ['tunnel'])
})

test('calls made together share one start', async () => {
  const { w, broker } = world()
  await Promise.all([broker.ensure(), broker.ensure(), broker.ensure()])
  assert.equal(w.calls.filter((c) => c === 'tunnel').length, 1)
  assert.equal(w.calls.filter((c) => c.startsWith('remote:')).length, 1)
})

test('no ssh host: says what to do instead of starting anything', async () => {
  const { w, broker } = world({ noHost: true })
  await assert.rejects(broker.ensure(), /MERIDIAN_BROWSER_SSH_HOST/)
  assert.deepEqual(w.calls, [])
})

test('a tunnel that cannot open reports why and leaves nothing behind', async () => {
  const { w, broker } = world({ tunnelWorks: false })
  await assert.rejects(broker.ensure(), /could not open the ssh tunnel to box: ssh: connect to host box port 22: No route to host/)
  assert.equal(w.killed, 1)
  assert.equal(broker.tunnel(), 'none')
})

test('a launch command that fails says so', async () => {
  const { broker } = world({ launchWorks: false })
  await assert.rejects(broker.ensure(), /could not start Chrome on box: schtasks/)
})

test('Chrome that never answers is reported, with a hint', async () => {
  const deps: BrokerDeps = {
    reachable: async () => false,
    portOpen: async () => true,
    startTunnel: () => ({ alive: () => true, kill: () => undefined, lastError: () => '' }),
    runRemote: async () => undefined,
    sleep: async () => undefined,
    log: () => undefined,
  }
  await assert.rejects(createBroker(cfg, deps).ensure(), /did not answer within 0s.*first-run dialog/)
})

function quietDeps(w: ReturnType<typeof world>['w']): BrokerDeps {
  return {
    reachable: async () => w.chrome && w.tunnel,
    portOpen: async () => w.tunnel,
    startTunnel: () => ((w.tunnel = true), { alive: () => w.alive, kill: () => (w.killed++, (w.tunnel = false), (w.alive = false)), lastError: () => '' }),
    runRemote: async () => void (w.chrome = true),
    sleep: async () => undefined,
    log: () => undefined,
  }
}

test('idle: the tunnel it opened is closed', async () => {
  const { w } = world()
  const broker = createBroker({ ...cfg, idleMs: 30 }, quietDeps(w))
  await broker.ensure()
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(w.killed, 1)
  assert.equal(broker.tunnel(), 'none')
})

test('idle: a tunnel started by hand is left alone', async () => {
  const { w } = world({ tunnel: true, chrome: true })
  const broker = createBroker({ ...cfg, idleMs: 30 }, quietDeps(w))
  await broker.ensure()
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(w.killed, 0)
  assert.equal(w.tunnel, true)
})

test('stop closes our tunnel', async () => {
  const { w, broker } = world()
  await broker.ensure()
  broker.stop()
  assert.equal(w.killed, 1)
})
