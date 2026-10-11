import Ajv, { type ValidateFunction } from 'ajv'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditLog } from '../audit.js'
import { RpcFailure } from '../browser/gateway.js'
import { askIrreversible, askOwner, DeclinedError, untrusted, type Confirm } from '../policy.js'
import type { DeviceStore } from '../store.js'
import { ExecutorGateway, type ExecutorConnection } from './gateway.js'

const KEEP_SCREENSHOTS = 20

const ajv = new Ajv({ strict: false })

const brief = (input: unknown): string => {
  const text = JSON.stringify(input ?? {})
  return text.length > 100 ? `${text.slice(0, 100)}…` : text
}

// What a device can do is whatever it announced: this layer knows no capability by name, only tiers and schemas.
export class ExecutorTools {
  private readonly validators = new WeakMap<ExecutorConnection, Map<string, ValidateFunction>>()

  constructor(
    private readonly gateway: ExecutorGateway,
    private readonly store: DeviceStore,
    private readonly audit: AuditLog,
    private readonly screensDir: string,
    private readonly enrollment: () => { url?: string; serverKey: string },
  ) {}

  list(): string {
    const lines = this.gateway.list().map((c) => {
      const caps = c.capabilities.map((k) => `${k.name}${k.tier === 'observe' ? '' : k.tier === 'act' ? '*' : '!'}`).join(', ')
      return `${c.name} (${c.hello.os}, id ${c.device.id}): ${caps}`
    })
    const waiting = this.store.pendingExecutors().map((d) => `waiting for approval: ${d.label} (id ${d.id})`)
    if (lines.length === 0 && waiting.length === 0) return 'No device is connected.'
    const legend = lines.length ? '\n(* changes something, ! cannot be undone and always asks the owner; device_describe shows the inputs)' : ''
    // Names come from the devices themselves, so they are data like anything else a machine reports.
    return untrusted([...lines, ...waiting].join('\n')) + legend
  }

  describe(who: string): string {
    const conn = this.gateway.find(who)
    return conn.capabilities.map((c) => `${c.name} [${c.tier}] ${c.description}\n  input: ${JSON.stringify(c.input)}`).join('\n')
  }

  enroll(): string {
    const { url, serverKey } = this.enrollment()
    return `Server address: ${url ?? '(set MERIDIAN_DEVICES_PUBLIC_URL)'}\nServer public key (the executor pins this): ${serverKey}`
  }

  async call(t: { device: string; capability: string; input?: unknown }, confirm: Confirm): Promise<string> {
    let conn: ExecutorConnection | undefined
    let outcome: 'ok' | 'refused' | 'declined' | 'error' = 'ok'
    try {
      conn = this.gateway.find(t.device)
      const cap = conn.capabilities.find((c) => c.name === t.capability)
      if (!cap) throw new Error(`${conn.name} has no capability "${t.capability}". It can: ${conn.capabilities.map((c) => c.name).join(', ')}.`)
      const input = t.input ?? {}
      const check = this.validator(conn, cap.name, cap.input)
      if (!check(input)) throw new Error(`Bad input for ${cap.name}: ${ajv.errorsText(check.errors)}`)

      const what = `${cap.name} ${brief(input)}`
      if (cap.tier === 'irreversible') await askIrreversible(conn.name, what, confirm)
      else if (cap.tier === 'act') await askOwner(conn.name, what, undefined, confirm)

      const out = await conn.call(cap.name, input)
      const saved = out.image ? `\nScreenshot saved at ${this.saveImage(conn.name, out.image)} (open it with the Read tool only if you must see it).` : ''
      // What a device reads off the PC (window titles, the clipboard) was written by someone else.
      return cap.tier === 'observe' ? untrusted(out.text + saved) : out.text + saved
    } catch (err) {
      outcome = err instanceof DeclinedError ? 'declined' : err instanceof RpcFailure ? 'error' : 'refused'
      throw err instanceof RpcFailure ? new Error(`${conn?.name ?? t.device} said: ${err.message}`) : err
    } finally {
      this.audit.record({ device: conn?.name ?? '-', tool: t.capability, outcome })
    }
  }

  private validator(conn: ExecutorConnection, name: string, schema: Record<string, unknown>): ValidateFunction {
    let byName = this.validators.get(conn)
    if (!byName) this.validators.set(conn, (byName = new Map()))
    let v = byName.get(name)
    if (!v) byName.set(name, (v = ajv.compile(schema)))
    return v
  }

  private saveImage(device: string, png: Buffer): string {
    mkdirSync(this.screensDir, { recursive: true, mode: 0o700 })
    const file = join(this.screensDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}-${device.replace(/[^a-z0-9]/gi, '_')}.png`)
    writeFileSync(file, png, { mode: 0o600 })
    chmodSync(file, 0o600)
    // Screens can hold anything the owner had open: only the latest few stay.
    for (const old of readdirSync(this.screensDir).sort().slice(0, -KEEP_SCREENSHOTS)) rmSync(join(this.screensDir, old), { force: true })
    return file
  }
}
