import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AuditLog } from './audit.js'
import { parseTargets } from './app-ui/targets.js'
import { AppTools } from './app-ui/tools.js'
import { createAppIo } from './app-ui/tunnel.js'
import { parseAllowlist } from './browser/allowlist.js'
import { BrowserGateway } from './browser/gateway.js'
import { BrowserTools } from './browser/tools.js'
import { KillSwitch } from './kill-switch.js'
import { DeviceStore } from './store.js'

export interface Runtime {
  store: DeviceStore
  audit: AuditLog
  killSwitch: KillSwitch
  gateway: BrowserGateway
  tools: BrowserTools
  apps: AppTools
  // wss://host/api/services/devices/extension, the address a pairing link carries.
  publicUrl: string | undefined
}

let runtime: Runtime | undefined

export function getRuntime(): Runtime {
  if (runtime) return runtime
  const dir = process.env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian')
  mkdirSync(dir, { recursive: true })
  // Same file as the core's settings, so one backup covers everything.
  const db = new DatabaseSync(join(dir, 'meridian.db'))
  db.exec('PRAGMA journal_mode = WAL')
  const store = new DeviceStore(db)
  const killSwitch = new KillSwitch(store)
  const audit = new AuditLog(join(dir, 'devices', 'audit.log'))
  const gateway = new BrowserGateway({ store, killSwitch })
  const tools = new BrowserTools(gateway, audit, parseAllowlist(process.env.MERIDIAN_DEVICES_BROWSER_ALLOWED_DOMAINS))
  const io = createAppIo(process.env.MERIDIAN_DEVICES_APPS_SSH_HOST || undefined, (event) => audit.record({ device: 'tunnel', tool: 'app_tunnel', target: event, outcome: 'ok' }))
  killSwitch.onEngage(io.stopAll)
  const apps = new AppTools({ targets: parseTargets(process.env.MERIDIAN_DEVICES_APPS), audit, killSwitch, reachable: io.reachable, open: io.open })
  runtime = { store, audit, killSwitch, gateway, tools, apps, publicUrl: process.env.MERIDIAN_DEVICES_PUBLIC_URL }
  return runtime
}
