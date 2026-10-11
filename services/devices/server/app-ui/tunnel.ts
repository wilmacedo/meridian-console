import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { createBroker, type Broker, type BrokerDeps } from './broker.js'
import { CdpSession, listTargets, CdpError } from './cdp.js'
import { closedHint, type AppTarget } from './targets.js'
import type { AppPage } from './tools.js'

const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']
const IDLE_MS = 10 * 60_000

const reachableAt = async (port: number): Promise<boolean> => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

function brokerFor(app: AppTarget, sshHost: string | undefined, log: (event: string) => void): Broker {
  const deps: BrokerDeps = {
    reachable: () => reachableAt(app.localPort),
    portOpen: () =>
      new Promise((resolve) => {
        const socket = connect({ host: '127.0.0.1', port: app.localPort })
        socket.setTimeout(500)
        socket.once('connect', () => (socket.destroy(), resolve(true)))
        socket.once('timeout', () => (socket.destroy(), resolve(false)))
        socket.once('error', () => resolve(false))
      }),
    startTunnel: () => {
      const child = spawn('ssh', ['-N', ...SSH_OPTIONS, '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${app.localPort}:127.0.0.1:${app.remotePort}`, sshHost!], { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      let exited = false
      child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-500)))
      child.on('exit', () => (exited = true))
      return { alive: () => !exited, kill: () => void child.kill('SIGTERM'), lastError: () => stderr }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
  }
  const broker = createBroker({ sshHost, closedHint: closedHint(app), idleMs: IDLE_MS, tunnelWaitMs: 10_000, pollMs: 500 }, deps)
  // The tunnel is a child of the server: it goes when the server does.
  process.on('exit', () => broker.stop())
  return broker
}

// The real I/O behind AppTools: a tunnel per app, opened on demand, and one CDP connection per call.
export function createAppIo(sshHost: string | undefined, log: (event: string) => void) {
  const brokers = new Map<string, Broker>()
  const broker = (app: AppTarget): Broker => {
    let b = brokers.get(app.id)
    if (!b) brokers.set(app.id, (b = brokerFor(app, sshHost, log)))
    return b
  }
  return {
    stopAll: () => brokers.forEach((b) => b.stop()),
    reachable: (app: AppTarget) => reachableAt(app.localPort),
    open: async (app: AppTarget): Promise<AppPage> => {
      await broker(app).ensure()
      const page = (await listTargets(app.localPort)).find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (!page) throw new CdpError(`${app.id} is running but has no window open.`)
      // The app reports its own port; the page is reached through the tunnel's local end.
      const url = new URL(page.webSocketDebuggerUrl!)
      url.hostname = '127.0.0.1'
      url.port = String(app.localPort)
      return CdpSession.open(url.toString())
    },
  }
}
