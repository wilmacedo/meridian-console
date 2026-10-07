import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE, StaleVersionError, WorkspaceNotFoundError, WorkspaceStore } from './workspace-store.js'

const store = (): WorkspaceStore => new WorkspaceStore(new DatabaseSync(':memory:'))

describe('WorkspaceStore', () => {
  it('creates the default workspace on first start, once', () => {
    const db = new DatabaseSync(':memory:')
    new WorkspaceStore(db)
    const again = new WorkspaceStore(db)
    expect(again.list().map((w) => w.id)).toEqual([DEFAULT_WORKSPACE])
    expect(again.get(DEFAULT_WORKSPACE)).toMatchObject({ version: 1, state: {} })
  })

  it('stores state and bumps the version on update', () => {
    const s = store()
    const next = s.update(DEFAULT_WORKSPACE, 1, { theme: { mode: 'dark' } })
    expect(next.version).toBe(2)
    expect(s.get(DEFAULT_WORKSPACE)?.state).toEqual({ theme: { mode: 'dark' } })
  })

  it('rejects a write based on a stale version and reports the current one', () => {
    const s = store()
    s.update(DEFAULT_WORKSPACE, 1, { a: 1 })
    try {
      s.update(DEFAULT_WORKSPACE, 1, { a: 2 })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(StaleVersionError)
      expect((err as StaleVersionError).current).toMatchObject({ version: 2, state: { a: 1 } })
    }
    expect(s.get(DEFAULT_WORKSPACE)?.state).toEqual({ a: 1 })
  })

  it('rejects writes to a workspace that does not exist', () => {
    expect(() => store().update('nope', 1, {})).toThrow(WorkspaceNotFoundError)
  })

  it('creates a workspace with the id asked for once, and returns it as it is afterwards', () => {
    const s = new WorkspaceStore(new DatabaseSync(':memory:'))
    const first = s.create('1', '1')
    expect(first.id).toBe('1')
    expect(s.create('1', '1')).toEqual(first)
    expect(s.list().map((w) => w.id).sort()).toEqual(['1', 'default'])
  })

  it('creates further workspaces with unique kebab-case ids', () => {
    const s = store()
    expect(s.create('Left Monitor').id).toBe('left-monitor')
    expect(s.create('Left monitor').id).toBe('left-monitor-2')
    expect(s.list()).toHaveLength(3)
  })

  it('tells subscribers about every accepted update', () => {
    const s = store()
    const seen: number[] = []
    const stop = s.subscribe((w) => seen.push(w.version))
    s.update(DEFAULT_WORKSPACE, 1, {})
    s.update(DEFAULT_WORKSPACE, 2, {})
    stop()
    s.update(DEFAULT_WORKSPACE, 3, {})
    expect(seen).toEqual([2, 3])
  })
})
