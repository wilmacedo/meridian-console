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

// A workspace needs a name of its own: the same name, or one that makes the same id, is refused.
export class WorkspaceNameTakenError extends Error {}

// The default workspace is the one every address falls back to; it cannot be deleted.
export class WorkspaceProtectedError extends Error {}

// What a workspace made after the default starts with: the default's theme, so a new one looks like the rest.
const FALLBACK_THEME = { mode: 'auto', palette: 'meridian' }

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

  // In the order they were made, which is the order of the switcher and of its Alt+number shortcuts.
  list(): WorkspaceSummary[] {
    const rows = this.db.prepare('SELECT id, name, version, updated_at FROM workspaces ORDER BY rowid').all() as unknown as Row[]
    return rows.map((r) => ({ id: r.id, name: r.name, version: r.version, updatedAt: r.updated_at }))
  }

  // The same list with each workspace's state, for the switcher's thumbnails.
  listFull(): Workspace[] {
    const rows = this.db.prepare('SELECT * FROM workspaces ORDER BY rowid').all() as unknown as Row[]
    return rows.map(toWorkspace)
  }

  get(id: string): Workspace | undefined {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as unknown as Row | undefined
    return row && toWorkspace(row)
  }

  // With `wantedId` (what an address asked for), an existing workspace of that id is returned as it is, so two
  // screens opening the same new address end up on one workspace, not two. Without it, the name must be new.
  create(name: string, wantedId?: string): Workspace {
    if (wantedId !== undefined) return this.get(wantedId) ?? this.insert(wantedId, name)
    const trimmed = name.trim()
    this.assertFree(trimmed)
    return this.insert(slug(trimmed), trimmed)
  }

  // Changes the name shown; the id, which addresses and tabs hold on to, stays.
  rename(id: string, name: string): Workspace {
    const current = this.get(id)
    if (!current) throw new WorkspaceNotFoundError(id)
    const trimmed = name.trim()
    this.assertFree(trimmed, id)
    const updatedAt = new Date().toISOString()
    this.db.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(trimmed, updatedAt, id)
    return { ...current, name: trimmed, updatedAt }
  }

  // A new workspace with the same layout, widgets and settings. Without a name it is "<name> copy".
  duplicate(id: string, name?: string): Workspace {
    const source = this.get(id)
    if (!source) throw new WorkspaceNotFoundError(id)
    const wanted = name?.trim() || `${source.name} copy`
    const taken = (n: string): boolean => this.nameTaken(n)
    let candidate = wanted
    for (let i = 2; taken(candidate); i++) candidate = `${wanted} ${i}`
    const copy = this.insert(slug(candidate), candidate)
    this.db.prepare('UPDATE workspaces SET state = ? WHERE id = ?').run(JSON.stringify(source.state), copy.id)
    return { ...copy, state: source.state }
  }

  remove(id: string): void {
    if (id === DEFAULT_WORKSPACE) throw new WorkspaceProtectedError(id)
    if (!this.get(id)) throw new WorkspaceNotFoundError(id)
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
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

  // A name is taken when another workspace has it, or has the id it would make.
  private nameTaken(name: string, except?: string): boolean {
    const id = slug(name)
    return this.list().some((w) => w.id !== except && (w.id === id || w.name.toLowerCase() === name.toLowerCase()))
  }

  private assertFree(name: string, except?: string): void {
    if (!name || this.nameTaken(name, except)) throw new WorkspaceNameTakenError(name)
  }

  private insert(id: string, name: string): Workspace {
    const state = id === DEFAULT_WORKSPACE ? {} : { theme: (this.get(DEFAULT_WORKSPACE)?.state as { theme?: unknown } | undefined)?.theme ?? FALLBACK_THEME }
    const workspace: Workspace = { id, name, version: 1, updatedAt: new Date().toISOString(), state }
    this.db.prepare('INSERT INTO workspaces (id, name, state, version, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, JSON.stringify(state), 1, workspace.updatedAt)
    return workspace
  }
}
