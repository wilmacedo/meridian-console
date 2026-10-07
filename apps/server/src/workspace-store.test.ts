import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE, StaleVersionError, WorkspaceNameTakenError, WorkspaceNotFoundError, WorkspaceProtectedError, WorkspaceStore } from './workspace-store.js'

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

  it('creates further workspaces with kebab-case ids', () => {
    const s = store()
    expect(s.create('  Left Monitor ')).toMatchObject({ id: 'left-monitor', name: 'Left Monitor' })
    expect(s.list()).toHaveLength(2)
  })

  it('refuses a name that is taken, whatever its case, or that makes the id of one that exists', () => {
    const s = store()
    s.create('Left Monitor')
    expect(() => s.create('left monitor')).toThrow(WorkspaceNameTakenError)
    expect(() => s.create('Left-Monitor')).toThrow(WorkspaceNameTakenError)
    expect(() => s.create('Default')).toThrow(WorkspaceNameTakenError)
    expect(() => s.create('   ')).toThrow(WorkspaceNameTakenError)
    expect(s.list()).toHaveLength(2)
  })

  it('starts a new workspace with the default one\'s theme, or meridian when it has none', () => {
    const s = store()
    expect(s.create('A').state).toEqual({ theme: { mode: 'auto', palette: 'meridian' } })
    s.update(DEFAULT_WORKSPACE, 1, { theme: { mode: 'dark', palette: 'blue' }, windows: { list: [] } })
    expect(s.create('B').state).toEqual({ theme: { mode: 'dark', palette: 'blue' } })
    expect(s.create('C', 'c').state).toEqual({ theme: { mode: 'dark', palette: 'blue' } })
    expect(s.get(DEFAULT_WORKSPACE)?.state).toMatchObject({ windows: { list: [] } })
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

  it('lists workspaces in the order they were made, whatever changed since', () => {
    const s = store()
    s.create('Kitchen')
    s.create('Garage')
    s.update('garage', 1, { a: 1 })
    expect(s.list().map((w) => w.id)).toEqual([DEFAULT_WORKSPACE, 'kitchen', 'garage'])
    expect(s.listFull().find((w) => w.id === 'garage')?.state).toEqual({ a: 1 })
  })

  it('renames a workspace without changing its id or version, and keeps names unique', () => {
    const s = store()
    s.create('Kitchen')
    s.create('Garage')
    expect(s.rename('kitchen', 'Cooking')).toMatchObject({ id: 'kitchen', name: 'Cooking' })
    expect(s.get('kitchen')).toMatchObject({ name: 'Cooking', version: 1 })
    expect(() => s.rename('kitchen', 'garage')).toThrow(WorkspaceNameTakenError)
    expect(() => s.rename('kitchen', '  ')).toThrow(WorkspaceNameTakenError)
    expect(s.rename('kitchen', 'COOKING').name).toBe('COOKING')
    expect(() => s.rename('nope', 'x')).toThrow(WorkspaceNotFoundError)
  })

  it('duplicates a workspace with its state under a free name', () => {
    const s = store()
    s.create('Kitchen')
    s.update('kitchen', 1, { windows: { list: [] } })
    const copy = s.duplicate('kitchen')
    expect(copy).toMatchObject({ name: 'Kitchen copy', id: 'kitchen-copy', version: 1, state: { windows: { list: [] } } })
    expect(s.get('kitchen-copy')?.state).toEqual({ windows: { list: [] } })
    expect(s.duplicate('kitchen').name).toBe('Kitchen copy 2')
    expect(s.duplicate('kitchen', 'Spare').id).toBe('spare')
  })

  it('deletes a workspace but never the default one', () => {
    const s = store()
    s.create('Kitchen')
    s.remove('kitchen')
    expect(s.get('kitchen')).toBeUndefined()
    expect(() => s.remove(DEFAULT_WORKSPACE)).toThrow(WorkspaceProtectedError)
    expect(() => s.remove('kitchen')).toThrow(WorkspaceNotFoundError)
  })
})
