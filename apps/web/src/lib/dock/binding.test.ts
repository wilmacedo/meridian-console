import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@meridian/service-sdk'

const result = { lastFeed: { portions: 1, at: '2026-10-07T05:54:34Z' }, foodStorage: { value: 'full' }, blocked: false, hopper: 80, list: [{ name: 'a' }, { name: 'b' }] }

describe('renderTemplate', () => {
  it('writes values into text, anywhere in the template', () => {
    expect(renderTemplate({ t: 'kv', items: [{ k: 'LAST', v: '{{lastFeed.at}}' }, { k: 'HOPPER', v: '{{foodStorage.value}} ({{lastFeed.portions}} p)' }] }, result)).toEqual({
      t: 'kv',
      items: [
        { k: 'LAST', v: '2026-10-07T05:54:34Z' },
        { k: 'HOPPER', v: 'full (1 p)' },
      ],
    })
  })

  it('keeps the type when a string is a single placeholder', () => {
    expect(renderTemplate({ value: '{{hopper}}', flag: '{{blocked}}' }, result)).toEqual({ value: 80, flag: false })
  })

  it('reads array positions and shows an em dash where there is nothing', () => {
    expect(renderTemplate(['{{list.1.name}}', '{{nope.deeper}}', 'x {{nope}} y'], result)).toEqual(['b', '—', 'x — y'])
  })

  it('leaves non-string values alone and does not change its input', () => {
    const template = { n: 3, ok: true, none: null, s: '{{hopper}}' }
    expect(renderTemplate(template, result)).toEqual({ n: 3, ok: true, none: null, s: 80 })
    expect(template.s).toBe('{{hopper}}')
  })
})
