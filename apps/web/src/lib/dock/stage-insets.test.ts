import { describe, expect, it } from 'vitest'
import { BARE_INSET, insetOf, railSides, RAIL_INSET, stageInsets, STRIP_EXTRA } from './stage-insets'

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

describe('stageInsets', () => {
  it('makes room at the sides in the side layout', () => {
    expect(stageInsets({ L: true, R: false }, false)).toEqual({ left: RAIL_INSET, right: BARE_INSET, top: '0px', bottom: '0px' })
  })

  it('makes room above and below in the stacked layout: L is the top strip, R the bottom one', () => {
    expect(stageInsets({ L: true, R: false }, true)).toEqual({ left: BARE_INSET, right: BARE_INSET, top: STRIP_EXTRA, bottom: '0px' })
    expect(stageInsets({ L: false, R: true }, true)).toEqual({ left: BARE_INSET, right: BARE_INSET, top: '0px', bottom: STRIP_EXTRA })
  })
})
