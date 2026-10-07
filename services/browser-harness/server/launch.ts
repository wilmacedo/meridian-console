import { execFile, spawn } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { createBroker, type BrokerDeps } from './broker.js'
import { CDP_URL, STATE_DIR } from './gateway.js'

const LOCAL_PORT = Number(new URL(CDP_URL).port || 9222)
const REMOTE_PORT = Number(process.env.MERIDIAN_BROWSER_REMOTE_PORT ?? 9222)
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']

// Where Chrome lives, and the command that starts it there. On Windows an ssh session is not the desktop, so the
// command runs a scheduled task (services/browser-harness/scripts/windows-chrome-task.ps1) that has no trigger and
// starts Chrome in the owner's logged-in session.
export const SSH_HOST = process.env.MERIDIAN_BROWSER_SSH_HOST || undefined
const LAUNCH_COMMAND = process.env.MERIDIAN_BROWSER_LAUNCH_COMMAND || 'schtasks /run /tn MeridianChrome'
const IDLE_MS = Number(process.env.MERIDIAN_BROWSER_IDLE_MIN ?? 15) * 60_000

// The same audit log the gateway writes, so what the server started and stopped sits next to what was done.
function lifecycle(event: string): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
    const log = join(STATE_DIR, 'audit.log')
    appendFileSync(log, `${JSON.stringify({ ts: new Date().toISOString(), op: 'broker', state: event })}\n`)
    chmodSync(log, 0o600)
  } catch {
    // The log must never be the reason the browser cannot start.
  }
}

const deps: BrokerDeps = {
  reachable: async () => {
    try {
      return (await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(2000) })).ok
    } catch {
      return false
    }
  },
  portOpen: () =>
    new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port: LOCAL_PORT })
      socket.setTimeout(500)
      socket.once('connect', () => (socket.destroy(), resolve(true)))
      socket.once('timeout', () => (socket.destroy(), resolve(false)))
      socket.once('error', () => resolve(false))
    }),
  startTunnel: () => {
    const child = spawn('ssh', ['-N', ...SSH_OPTIONS, '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}`, SSH_HOST!], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let exited = false
    child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-500)))
    child.on('exit', () => (exited = true))
    return { alive: () => !exited, kill: () => void child.kill('SIGTERM'), lastError: () => stderr }
  },
  runRemote: (command) =>
    new Promise((resolve, reject) => {
      execFile('ssh', [...SSH_OPTIONS, SSH_HOST!, command], { timeout: 20_000 }, (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || stdout || err.message).trim().split('\n').at(-1)))
        else resolve()
      })
    }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: lifecycle,
}

export const broker = createBroker({ sshHost: SSH_HOST, launchCommand: LAUNCH_COMMAND, idleMs: IDLE_MS, tunnelWaitMs: 10_000, launchWaitMs: 30_000, pollMs: 500 }, deps)

// The tunnel is a child of the server: it goes when the server does.
process.on('exit', () => broker.stop())
