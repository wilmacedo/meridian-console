import type { ServiceActionInfo } from '@meridian/service-sdk'
import { describe, expect, it } from 'vitest'
import { GENERAL, groupActions, inputFields, matchesQuery } from './action-groups'

const action = (id: string, path: string, extra: Partial<ServiceActionInfo> = {}): ServiceActionInfo => ({ id, method: 'GET', path, title: id, description: '', mutating: false, ...extra })

describe('groupActions', () => {
  it('groups by the first path segment, the ungrouped first, in order of appearance', () => {
    const groups = groupActions([action('status', '/status'), action('open', '/browser/open'), action('list', '/device/list'), action('read', '/browser/read'), action('call', '/device/call'), action('kill', '/kill')])
    expect(groups.map((g) => [g.label, g.actions.map((a) => a.id)])).toEqual([
      [GENERAL, ['status', 'kill']],
      ['browser', ['open', 'read']],
      ['device', ['list', 'call']],
    ])
  })

  it('folds a segment only one action uses into the ungrouped, keeping the original order', () => {
    const groups = groupActions([action('a', '/a'), action('lone', '/farm/start'), action('b', '/b')])
    expect(groups).toEqual([{ id: '', label: GENERAL, actions: [action('a', '/a'), action('lone', '/farm/start'), action('b', '/b')] }])
  })

  it('leaves out an empty ungrouped group', () => {
    expect(groupActions([action('a', '/app/read'), action('b', '/app/click')]).map((g) => g.id)).toEqual(['app'])
    expect(groupActions([])).toEqual([])
  })
})

describe('matchesQuery', () => {
  const click = action('browser_click', '/browser/click', { title: 'Click in the page', description: 'Clicks an element' })

  it('needs every word somewhere in the path, title, description or id', () => {
    expect(matchesQuery(click, 'browser CLICK')).toBe(true)
    expect(matchesQuery(click, 'element page')).toBe(true)
    expect(matchesQuery(click, 'browser type')).toBe(false)
  })

  it('matches everything on an empty query', () => {
    expect(matchesQuery(click, '  ')).toBe(true)
  })
})

describe('inputFields', () => {
  it('lists top-level properties with their type and whether they are required', () => {
    const schema = { type: 'object', required: ['url'], properties: { url: { type: 'string', description: 'Page to open' }, tab: { type: ['number', 'null'] }, mode: { enum: ['a', 'b'] }, extra: {} } }
    expect(inputFields(schema)).toEqual([
      { name: 'url', type: 'string', required: true, description: 'Page to open' },
      { name: 'tab', type: 'number | null', required: false, description: undefined },
      { name: 'mode', type: 'a | b', required: false, description: undefined },
      { name: 'extra', type: 'any', required: false, description: undefined },
    ])
  })

  it('is empty without a schema or properties', () => {
    expect(inputFields(undefined)).toEqual([])
    expect(inputFields({ type: 'object' })).toEqual([])
  })
})
