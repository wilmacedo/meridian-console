import { describe, expect, it } from 'vitest'
import { resultBlocks, resultDoc, resultDocId } from './result-doc'

describe('resultBlocks', () => {
  it('shows a flat object as key/value pairs, nulls as a dash', () => {
    expect(resultBlocks({ connected: true, area: 'town', lag: null })).toEqual([{ t: 'kv', items: [{ k: 'connected', v: 'true' }, { k: 'area', v: 'town' }, { k: 'lag', v: '—' }] }])
  })

  it('shows a list of flat objects as a table, capped, with the columns they share', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: i, name: `n${i}` }))
    const [table, note] = resultBlocks(rows)
    expect(table).toMatchObject({ t: 'table', cols: [{ label: 'id' }, { label: 'name' }] })
    expect((table as { rows: string[][] }).rows).toHaveLength(50)
    expect(note).toEqual({ t: 'p', text: '10 more not shown.' })
  })

  it('splits nested values under headings and falls back to JSON deeper down', () => {
    const blocks = resultBlocks({ ok: true, player: { name: 'a', stats: { hp: 1 } }, tags: ['x', 'y'] })
    expect(blocks[0]).toMatchObject({ t: 'kv' })
    expect(blocks).toContainEqual({ t: 'h', level: 2, text: 'player' })
    expect(blocks).toContainEqual({ t: 'code', lang: 'json', text: JSON.stringify({ hp: 1 }, null, 2) })
    expect(blocks).toContainEqual({ t: 'code', lang: 'json', text: JSON.stringify(['x', 'y'], null, 2) })
  })

  it('handles empty and plain results', () => {
    expect(resultBlocks(null)).toEqual([{ t: 'p', text: 'No result.' }])
    expect(resultBlocks([])).toEqual([{ t: 'p', text: 'Empty list.' }])
    expect(resultBlocks('line one\nline two')).toEqual([{ t: 'code', text: 'line one\nline two' }])
    expect(resultBlocks(42)).toEqual([{ t: 'p', text: '42' }])
  })
})

describe('resultDoc', () => {
  it('has a fixed id per service and action, and names both in the title', () => {
    const doc = resultDoc('aqw-idle', 'aqw-idle', { id: 'presence-status', title: 'Presence status', method: 'GET', path: '/presence-status' }, [])
    expect(doc.id).toBe(resultDocId('aqw-idle', 'presence-status'))
    expect(doc.title).toBe('aqw-idle · Presence status')
    expect(doc.kicker).toBe('RESULT · GET /presence-status')
  })
})
