import { describe, expect, it } from 'vitest'
import { BARE_INSET, insetOf, railSides, RAIL_INSET } from './stage-insets'

describe('railSides', () => {
  it('reserves nothing when both rails are empty', () => {
    expect(railSides({ L: [], R: [] }, false)).toEqual({ L: false, R: false })
  })

  it('reserves only the side that holds widgets', () => {
    expect(railSides({ L: ['a'], R: [] }, false)).toEqual({ L: true, R: false })
    expect(railSides({ L: [], R: ['a'] }, false)).toEqual({ L: false, R: true })
    expect(railSides({ L: ['a'], R: ['b'] }, false)).toEqual({ L: true, R: true })
  })

  it('reserves both sides while a widget is dragged or a pin is placed, so empty rails can take the drop', () => {
    expect(railSides({ L: [], R: [] }, true)).toEqual({ L: true, R: true })
    expect(railSides({ L: ['a'], R: [] }, true)).toEqual({ L: true, R: true })
  })
})

describe('insetOf', () => {
  it('maps a reserved side to the rail inset and a bare one to the margin', () => {
    expect(insetOf(true)).toBe(RAIL_INSET)
    expect(insetOf(false)).toBe(BARE_INSET)
  })
})
