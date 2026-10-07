import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export function openDatabase(): Database.Database {
  const dir = process.env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian')
  mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, 'meridian.db'))
  db.pragma('journal_mode = WAL')
  return db
}
