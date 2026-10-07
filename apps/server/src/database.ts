import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openDatabase(): DatabaseSync {
  const dir = process.env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian')
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'meridian.db'))
  db.exec('PRAGMA journal_mode = WAL')
  return db
}
