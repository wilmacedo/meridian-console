import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Emit } from '@meridian/service-sdk/server'
import { CalendarService } from './calendar-service.js'
import { CalendarStore } from './calendar-store.js'
import { GoogleCalendarApi } from './google-client.js'
import { parseKey } from './token-crypto.js'

export interface Runtime {
  store: CalendarStore
  google: GoogleCalendarApi
  service: CalendarService
}

let emitter: Emit | undefined
let runtime: Runtime | undefined

// The core hands a service its event emitter only when it starts it, and the stream is where the window learns
// that something changed.
export const setEmitter = (emit: Emit | undefined): void => {
  emitter = emit
}

export function missingConfig(): string | undefined {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set'
  if (!parseKey(process.env.CALENDAR_TOKEN_KEY)) return 'CALENDAR_TOKEN_KEY is not set (32 random bytes, base64)'
  return undefined
}

export function getRuntime(): Runtime {
  if (runtime) return runtime
  const problem = missingConfig()
  if (problem) throw new Error(problem)

  const dir = process.env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian')
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'calendar.db'))
  db.exec('PRAGMA journal_mode = WAL')

  const store = new CalendarStore(db, parseKey(process.env.CALENDAR_TOKEN_KEY)!)
  const google = new GoogleCalendarApi({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })
  runtime = { store, google, service: new CalendarService(store, google, (level, message) => emitter?.(level, message)) }
  return runtime
}
