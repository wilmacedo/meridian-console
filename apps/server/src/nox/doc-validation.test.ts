import { describe, expect, it } from 'vitest'
import { validateDoc } from './doc-validation.js'

const doc = (...blocks: unknown[]) => ({ title: 'Status', kicker: 'Now', blocks })

describe('validateDoc', () => {
  it('accepts every block type', () => {
    const out = validateDoc(
      doc(
        { t: 'h', level: 1, text: 'Hi', eyebrow: 'HOME' },
        { t: 'p', text: 'text' },
        { t: 'stats', items: [{ label: 'CPU', value: 23, unit: '%', tone: 'ok' }] },
        { t: 'progress', items: [{ label: 'Disk', value: 40.5, tone: 'warn' }] },
        { t: 'table', cols: [{ label: 'A' }, { label: 'B', align: 'right' }], rows: [['x', { v: 'y', tone: 'bad' }]] },
        { t: 'list', items: [{ text: 'one', state: 'done' }, { text: 'two' }] },
        { t: 'callout', tone: 'warn', title: 'Careful', text: 'Hot' },
        { t: 'kv', items: [{ k: 'k', v: 'v' }] },
        { t: 'code', lang: 'SHELL', text: 'ls' },
        { t: 'tags', items: [{ label: 'v1' }] },
        { t: 'divider' },
      ),
    )
    expect(out.blocks).toHaveLength(11)
  })

  it('drops undefined keys so the result is plain JSON', () => {
    const out = validateDoc(doc({ t: 'p', text: 'x' }))
    expect(out.blocks[0]).toEqual({ t: 'p', text: 'x' })
    expect(Object.keys(out.blocks[0])).toEqual(['t', 'text'])
  })

  it('defaults a missing kicker to empty', () => {
    expect(validateDoc({ title: 'T', blocks: [{ t: 'divider' }] }).kicker).toBe('')
  })

  it('names the path of what is wrong', () => {
    expect(() => validateDoc(doc({ t: 'stats', items: [{ label: 'CPU', value: {} }] }))).toThrow('blocks[0].items[0].value')
    expect(() => validateDoc(doc({ t: 'progress', items: [{ label: 'x', value: 'many' }] }))).toThrow('expected a number')
    expect(() => validateDoc(doc({ t: 'callout', text: 'x', tone: 'purple' }))).toThrow('must be ok, warn, bad, accent, fg, dim')
    expect(() => validateDoc(doc({ t: 'chart' }))).toThrow('unknown block type "chart"')
  })

  it('needs between 1 and 60 blocks', () => {
    expect(() => validateDoc(doc())).toThrow('between 1 and 60')
    expect(() => validateDoc(doc(...Array.from({ length: 61 }, () => ({ t: 'divider' }))))).toThrow('between 1 and 60')
  })

  it('rejects something that is not a document', () => {
    expect(() => validateDoc('hello')).toThrow('expected an object')
    expect(() => validateDoc({ title: 1, blocks: [{ t: 'divider' }] })).toThrow('title: expected a string')
  })
})
