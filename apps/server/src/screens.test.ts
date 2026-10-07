import { describe, expect, it } from 'vitest'
import type { DocSpec } from '@meridian/service-sdk'
import { ScreenRegistry } from './screens.js'

const doc = (id: string | undefined, title: string): DocSpec => ({ id, title, kicker: '', blocks: [{ t: 'p', text: 'x' }] })

describe('ScreenRegistry live documents', () => {
  it('remembers the latest version of a document with an id, even with no screen to show it', () => {
    const screens = new ScreenRegistry()
    expect(screens.dispatch('default', { name: 'compose_doc', doc: doc('task-1', 'first') })).toBe(false)
    screens.dispatch('default', { name: 'compose_doc', doc: doc('task-1', 'second') })
    expect(screens.doc('task-1')?.title).toBe('second')
  })

  it('does not keep documents without an id', () => {
    const screens = new ScreenRegistry()
    screens.dispatch('default', { name: 'compose_doc', doc: doc(undefined, 'plain') })
    expect(screens.doc('undefined')).toBeUndefined()
  })

  it('forgets the oldest documents past a limit', () => {
    const screens = new ScreenRegistry()
    for (let i = 0; i < 52; i++) screens.dispatch('default', { name: 'compose_doc', doc: doc(`d-${i}`, 'x') })
    expect(screens.doc('d-0')).toBeUndefined()
    expect(screens.doc('d-51')).toBeDefined()
  })
})
