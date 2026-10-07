import { describe, expect, it } from 'vitest'
import type { DocSpec, ScreenCommand, StreamMessage } from '@meridian/service-sdk'
import { ScreenRegistry } from './screens.js'

const doc = (id: string | undefined, title: string): DocSpec => ({ id, title, kicker: '', blocks: [{ t: 'p', text: 'x' }] })

function tabs() {
  const screens = new ScreenRegistry()
  const a: StreamMessage[] = []
  const b: StreamMessage[] = []
  screens.watch(screens.add((m) => a.push(m)), 'default', 'tab-a')
  screens.watch(screens.add((m) => b.push(m)), 'default', 'tab-b')
  const speech = (turn: number): StreamMessage => ({ type: 'speech_end', turn })
  return { screens, a, b, speech }
}

describe('ScreenRegistry routing', () => {
  it('sends to the newest screen by default, and to the one that asked when it is named', () => {
    const { screens, a, b, speech } = tabs()
    screens.sendTo('default', speech(1))
    screens.sendTo('default', speech(2), 'tab-a')
    expect(b.filter((m) => m.type === 'speech_end')).toHaveLength(1)
    expect(a.filter((m) => m.type === 'speech_end')).toEqual([speech(2)])
  })

  it('falls back to the newest screen when the one named is gone or shows another workspace', () => {
    const { screens, b, speech } = tabs()
    screens.sendTo('default', speech(1), 'tab-gone')
    expect(b.filter((m) => m.type === 'speech_end')).toHaveLength(1)
    expect(screens.sendTo('elsewhere', speech(2), 'tab-a')).toBe(false)
  })

  it('keeps a live document on the screen it appeared on, even when a newer one asks later', () => {
    const { screens, a, b } = tabs()
    const doc = (title: string): ScreenCommand => ({ name: 'compose_doc', doc: { id: 'task-1', title, kicker: '', blocks: [{ t: 'p', text: 'x' }] } })
    screens.dispatch('default', doc('first'), 'tab-a')
    screens.dispatch('default', doc('update'))
    screens.dispatch('default', doc('later'), 'tab-b')
    expect(a.filter((m) => m.type === 'command')).toHaveLength(3)
    expect(b.filter((m) => m.type === 'command')).toHaveLength(0)
  })
})

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
