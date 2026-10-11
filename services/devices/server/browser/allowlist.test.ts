import { describe, expect, it } from 'vitest'
import { parseAllowlist } from './allowlist.js'

describe('parseAllowlist', () => {
  it('allows every host when nothing is configured', () => {
    expect(parseAllowlist(undefined)('personal')).toEqual(['*'])
    expect(parseAllowlist('')('work')).toEqual(['*'])
  })

  it('gives each profile its own list, with a fallback', () => {
    const allowed = parseAllowlist('personal=youtube.com, Example.com ; work=* ; *=none.test')
    expect(allowed('personal')).toEqual(['youtube.com', 'example.com'])
    expect(allowed('Work')).toEqual(['*'])
    expect(allowed('other')).toEqual(['none.test'])
  })

  it('ignores malformed entries', () => {
    expect(parseAllowlist('personal=;=x.com;junk')('personal')).toEqual(['*'])
  })
})
