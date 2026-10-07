import { describe, expect, it } from 'vitest'
import type { StreamMessage } from '@meridian/service-sdk'
import { ScreenRegistry } from './screens.js'

const inbox = (): { messages: StreamMessage[]; send: (m: StreamMessage) => void } => {
  const messages: StreamMessage[] = []
  return { messages, send: (m) => messages.push(m) }
}

describe('ScreenRegistry', () => {
  it('counts the screens showing each workspace', () => {
    const r = new ScreenRegistry()
    const a = r.add(() => {})
    const b = r.add(() => {})
    r.add(() => {})
    r.watch(a, 'default')
    r.watch(b, 'default')
    expect(r.counts()).toEqual({ default: 2 })
  })

  it('runs a command on the newest screen of the workspace only', async () => {
    const r = new ScreenRegistry()
    const old = inbox()
    const fresh = inbox()
    const other = inbox()
    r.watch(r.add(old.send), 'default')
    await new Promise((resolve) => setTimeout(resolve, 5))
    r.watch(r.add(fresh.send), 'default')
    r.watch(r.add(other.send), 'left')
    expect(r.dispatch('default', { name: 'arrange' })).toBe(true)
    const commands = (i: { messages: StreamMessage[] }): number => i.messages.filter((m) => m.type === 'command').length
    expect([commands(old), commands(fresh), commands(other)]).toEqual([0, 1, 0])
  })

  it('reports when no screen shows the workspace', () => {
    expect(new ScreenRegistry().dispatch('default', { name: 'arrange' })).toBe(false)
  })

  it('tells every screen, including new ones, the agent mode', () => {
    const r = new ScreenRegistry()
    const early = inbox()
    r.add(early.send)
    r.setAgentMode('thinking')
    const late = inbox()
    r.add(late.send)
    expect(early.messages.at(-1)).toEqual({ type: 'agent', mode: 'thinking' })
    expect(late.messages[0]).toEqual({ type: 'agent', mode: 'thinking' })
  })

  it('forgets screens that disconnect', () => {
    const r = new ScreenRegistry()
    const key = r.add(() => {})
    r.watch(key, 'default')
    r.remove(key)
    expect(r.counts()).toEqual({})
    expect(r.dispatch('default', { name: 'arrange' })).toBe(false)
  })
})
