import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVICE_DIR = fileURLToPath(new URL('..', import.meta.url))
const GATEWAY = join(SERVICE_DIR, 'gateway', 'gateway.py')
const PYTHON = process.env.MERIDIAN_BROWSER_PYTHON ?? join(SERVICE_DIR, '.venv', 'bin', 'python')
const CALL_TIMEOUT_MS = 90_000

export const CDP_URL = (process.env.MERIDIAN_BROWSER_CDP_URL ?? 'http://127.0.0.1:9222').replace(/\/$/, '')
export const STATE_DIR = process.env.MERIDIAN_BROWSER_STATE_DIR ?? join(homedir(), '.meridian', 'browser-harness')

// The key that seals the owner's confirmations. It exists only in this process and is handed to the gateway
// over its stdin: not in an environment variable, not on a command line, and never to NOX.
const CONFIRM_KEY = randomBytes(32).toString('hex')
const seal = (fingerprint: string): string => createHmac('sha256', CONFIRM_KEY).update(fingerprint).digest('hex').slice(0, 32)

export interface GatewayResult {
  ok: boolean
  text?: string
  error?: string
  needs_confirmation?: boolean
  fingerprint?: string
  what?: string
  [key: string]: unknown
}

function spawnGateway(op: string, args: object, confirmation?: string): Promise<GatewayResult> {
  // A minimal environment, so nothing else from the server's (API keys, tokens) reaches the browser tooling.
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MERIDIAN_BROWSER_CDP_URL: CDP_URL, MERIDIAN_BROWSER_STATE_DIR: STATE_DIR }
  if (process.env.MERIDIAN_BROWSER_ALLOWED_DOMAINS) env.MERIDIAN_BROWSER_ALLOWED_DOMAINS = process.env.MERIDIAN_BROWSER_ALLOWED_DOMAINS
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [GATEWAY], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), CALL_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`gateway failed to start: ${err.message}`))
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(out) as GatewayResult)
      } catch {
        reject(new Error('gateway returned no result'))
      }
    })
    child.stdin.end(JSON.stringify({ op, args, confirmKey: CONFIRM_KEY, confirmation }))
  })
}

// The gateway is the policy point (allowlist, risk, audit log); this runs it and, when it says a call needs the
// owner, asks through `confirm` and sends the call again with the seal of exactly what was confirmed.
export async function callGateway(op: string, args: object, confirm: (what: string) => Promise<boolean>): Promise<string> {
  let result = await spawnGateway(op, args)
  if (result.needs_confirmation) {
    if (!result.fingerprint || !result.what) throw new Error('gateway asked for a confirmation without saying what for')
    if (!(await confirm(`Browser: ${result.what}`))) throw new Error('The owner did not confirm this, so it was not done.')
    result = await spawnGateway(op, args, seal(result.fingerprint))
  }
  if (!result.ok) throw new Error(result.error ?? `${op} failed`)
  return result.text ?? 'Done.'
}

// Straight from Chrome's debug port: no page content, only whether it answers, its version and the hosts of the open tabs.
export async function browserStatus(): Promise<{ reachable: boolean; browser?: string; tabs?: string[] }> {
  try {
    const signal = AbortSignal.timeout(2000)
    const version = (await (await fetch(`${CDP_URL}/json/version`, { signal })).json()) as { Browser?: string }
    const list = (await (await fetch(`${CDP_URL}/json/list`, { signal })).json()) as { type: string; url: string }[]
    const tabs = list.filter((t) => t.type === 'page').map((t) => new URL(t.url).hostname || t.url.split(':')[0])
    return { reachable: true, browser: version.Browser, tabs }
  } catch {
    return { reachable: false }
  }
}
