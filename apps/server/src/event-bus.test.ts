import { describe, expect, it } from 'vitest'
import { EventBus } from './event-bus.js'

describe('EventBus', () => {
  it('numbers events and returns them oldest first', () => {
    const bus = new EventBus()
    bus.emit('aqw-idle', 'info', 'one')
    bus.emit('core', 'warn', 'two')
    expect(bus.recent().map((e) => [e.id, e.source, e.level, e.message])).toEqual([
      [1, 'aqw-idle', 'info', 'one'],
      [2, 'core', 'warn', 'two'],
    ])
  })

  it('keeps only the most recent events', () => {
    const bus = new EventBus(3)
    for (let i = 1; i <= 5; i++) bus.emit('core', 'info', `e${i}`)
    expect(bus.recent().map((e) => e.message)).toEqual(['e3', 'e4', 'e5'])
  })

  it('notifies subscribers until they unsubscribe', () => {
    const bus = new EventBus()
    const seen: string[] = []
    const stop = bus.subscribe((e) => seen.push(e.message))
    bus.emit('core', 'info', 'a')
    stop()
    bus.emit('core', 'info', 'b')
    expect(seen).toEqual(['a'])
  })
})
