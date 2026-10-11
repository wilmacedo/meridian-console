import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AuditLog } from './audit.js'
import { KillSwitch } from './kill-switch.js'
import { DeviceStore } from './store.js'

export interface Runtime {
  store: DeviceStore
  audit: AuditLog
  killSwitch: KillSwitch
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
  runtime = { store, audit: new AuditLog(join(dir, 'devices', 'audit.log')), killSwitch: new KillSwitch(store) }
  return runtime
}
