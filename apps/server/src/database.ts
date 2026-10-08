import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const dataDir = (): string => process.env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian')

export function openDatabase(): DatabaseSync {
  const dir = dataDir()
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'meridian.db'))
  db.exec('PRAGMA journal_mode = WAL')
  return db
}
