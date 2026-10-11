import { describe, expect, it } from 'vitest'
import { rowMatches, searchTerms, SETTINGS_SECTIONS, viewSettings } from './settings-index'

describe('searchTerms', () => {
  it('splits on whitespace and lower-cases', () => {
    expect(searchTerms('  Number   KEYS ')).toEqual(['number', 'keys'])
    expect(searchTerms('   ')).toEqual([])
  })
})

describe('rowMatches', () => {
  it('needs every term', () => {
    expect(rowMatches(['dock', 'order'], 'Dock', 'dock items order')).toBe(true)
    expect(rowMatches(['dock', 'voice'], 'Dock', 'dock items order')).toBe(false)
  })

  it('also searches the section label', () => {
    expect(rowMatches(['voice'], 'Voice', 'tail silence')).toBe(true)
  })
})

describe('viewSettings', () => {
  it('shows only the selected section, with its row count, when not searching', () => {
    const v = viewSettings(SETTINGS_SECTIONS, '', 'core')
    expect(v.searching).toBe(false)
    expect(v.sections.filter((s) => s.active).map((s) => s.id)).toEqual(['core'])
    expect(v.sections.find((s) => s.id === 'core')?.count).toBe(2)
    expect(v.shown.has('strands')).toBe(true)
    expect(v.shown.has('mode')).toBe(true)
  })

  it('numbers the sections by position', () => {
    const v = viewSettings(SETTINGS_SECTIONS.filter((s) => s.id !== 'services'), '', 'dock')
    expect(v.sections.map((s) => s.code).slice(-3)).toEqual(['05', '06', '07'])
  })

  it('lights every section with a hit, and counts them, when searching', () => {
    const v = viewSettings(SETTINGS_SECTIONS, 'dark', 'dock')
    expect(v.searching).toBe(true)
    expect(v.sections.filter((s) => s.active).map((s) => s.id)).toEqual(['appearance'])
    expect([...v.shown]).toEqual(['mode'])
    expect(v.hits).toBe(1)
  })

  it('brings in a whole section by its name', () => {
    const v = viewSettings(SETTINGS_SECTIONS, 'voice', 'dock')
    expect(v.sections.find((s) => s.id === 'voice')?.count).toBe(6)
  })

  it('reports no hits for a miss', () => {
    const v = viewSettings(SETTINGS_SECTIONS, 'zzz', 'dock')
    expect(v.hits).toBe(0)
    expect(v.sections.every((s) => !s.active && s.count === 0)).toBe(true)
  })
})
