import { describe, expect, it } from 'vitest'
import { phoneFor } from './phone'

describe('phoneFor', () => {
  it('is a phone below 600 px wide', () => {
    expect(phoneFor(390, false)).toBe(true)
    expect(phoneFor(599, false)).toBe(true)
  })

  it('is not at 600 px or more, so a phone turned sideways gets the desktop layout', () => {
    expect(phoneFor(600, false)).toBe(false)
    expect(phoneFor(844, false)).toBe(false)
  })

  it('leaves a narrow page in CarPlay mode to the car layout', () => {
    expect(phoneFor(390, true)).toBe(false)
  })
})
