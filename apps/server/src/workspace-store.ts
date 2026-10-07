import type { DatabaseSync } from 'node:sqlite'
import type { Workspace, WorkspaceSummary } from '@meridian/service-sdk'

export const DEFAULT_WORKSPACE = 'default'

// Raised when a write is based on an older version than the stored one: someone else (another screen,
// or NOX) changed the workspace since the writer last saw it.
export class StaleVersionError extends Error {
  constructor(readonly current: Workspace) {
    super(`workspace "${current.id}" is at version ${current.version}`)
  }
}

export class WorkspaceNotFoundError extends Error {}

interface Row {
  id: string
  name: string
  state: string
  version: number
  updated_at: string
}

const toWorkspace = (r: Row): Workspace => ({ id: r.id, name: r.name, version: r.version, updatedAt: r.updated_at, state: JSON.parse(r.state) })

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'

type Listener = (workspace: Workspace) => void

// Workspaces are first-class: each has its own layout, widgets and settings, and every screen showing
// one sees the same state. Nothing here assumes there is only one.
export class WorkspaceStore {
  private listeners = new Set<Listener>()

  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )`)
    if (!this.get(DEFAULT_WORKSPACE)) this.insert(DEFAULT_WORKSPACE, 'Default')
  }

  list(): WorkspaceSummary[] {
    const rows = this.db.prepare('SELECT id, name, version, updated_at FROM workspaces ORDER BY updated_at DESC').all() as unknown as Row[]
    return rows.map((r) => ({ id: r.id, name: r.name, version: r.version, updatedAt: r.updated_at }))
  }

  get(id: string): Workspace | undefined {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as unknown as Row | undefined
    return row && toWorkspace(row)
  }

  create(name: string): Workspace {
    const base = slug(name)
    let id = base
    for (let n = 2; this.get(id); n++) id = `${base}-${n}`
    return this.insert(id, name)
  }

  // `baseVersion` is the version the caller's state was derived from.
  update(id: string, baseVersion: number, state: unknown): Workspace {
    const current = this.get(id)
    if (!current) throw new WorkspaceNotFoundError(id)
    if (current.version !== baseVersion) throw new StaleVersionError(current)
    const next: Workspace = { ...current, version: current.version + 1, updatedAt: new Date().toISOString(), state }
    this.db.prepare('UPDATE workspaces SET state = ?, version = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), next.version, next.updatedAt, id)
    for (const listener of this.listeners) listener(next)
    return next
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private insert(id: string, name: string): Workspace {
    const workspace: Workspace = { id, name, version: 1, updatedAt: new Date().toISOString(), state: {} }
    this.db.prepare('INSERT INTO workspaces (id, name, state, version, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, '{}', 1, workspace.updatedAt)
    return workspace
  }
}
