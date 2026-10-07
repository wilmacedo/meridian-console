import { describe, expect, it } from 'vitest'
import { workspaceCard, workspaceCode } from './workspace-card'

describe('workspace card', () => {
  it('counts what is on the rails and the stage and caps the thumbnail', () => {
    const card = workspaceCard({ state: { dock: { rails: { L: ['w1', 'w2', 'w3', 'w4'], R: ['w5'] } }, windows: { list: [1, 2, 3, 4, 5] }, theme: { mode: 'dark', palette: 'blue' } } })
    expect(card).toMatchObject({ left: 3, right: 1, windows: 4, widgets: 5, meta: '5 WIDGETS · 5 WIN · BLUE/DARK' })
  })

  it('describes an empty, fresh workspace', () => {
    expect(workspaceCard({ state: {} })).toMatchObject({ left: 0, right: 0, windows: 0, meta: '0 WIDGETS · 0 WIN · MERIDIAN/AUTO' })
    expect(workspaceCard({ state: null }).widgets).toBe(0)
  })

  it('numbers workspaces from 01', () => {
    expect(workspaceCode(0)).toBe('01')
    expect(workspaceCode(11)).toBe('12')
  })
})
