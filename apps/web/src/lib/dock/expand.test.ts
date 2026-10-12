import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The orb's state registers itself on `window` in dev; these tests run without a DOM, but for the size of a screen that the layout reads.
vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800, addEventListener: () => {} })
const { dock, insertWidget, resetDock } = await import('./dock.svelte')
const { expandWidget } = await import('./expand')
const { boundWidget, docWidget, logs, services, tele } = await import('./widgets')
const { docs, restoreDoc } = await import('../docs/docs.svelte')
const { eventsView } = await import('../live/events-view.svelte')
const { isOpen, open, setStage, wm } = await import('../windows/window-manager.svelte')

const openIds = (): string[] => wm.wins.filter((w) => !w.closing).map((w) => w.id)
const settle = (): void => void vi.advanceTimersByTime(2000)

beforeEach(() => {
  vi.useFakeTimers()
  resetDock()
  restoreDoc(null)
  wm.wins = []
  wm.custom = false
  setStage({ w: 1200, h: 800 })
  settle()
})
afterEach(() => vi.useRealTimers())

describe('expandWidget', () => {
  it('takes a system widget off the dock and opens the window it was pinned from', () => {
    expandWidget('w1')
    expect(isOpen('telemetry')).toBe(true)
    settle()
    expect(dock.widgets.w1).toBeUndefined()
    expect(dock.rails.L).toEqual([])
  })

  it('opens the events window on the service the widget was showing', () => {
    const id = insertWidget(logs('nas'), 'R', 0)
    expandWidget(id)
    expect(isOpen('logs')).toBe(true)
    expect(eventsView.filter).toBe('nas')
  })

  it('brings a docked document back to the doc window', () => {
    const id = insertWidget(docWidget('Backups', [{ t: 'p', text: 'ok' }], 'backups'), 'R', 0)
    expandWidget(id)
    expect(isOpen('doc')).toBe(true)
    expect(docs.current).toMatchObject({ id: 'backups', title: 'Backups' })
  })

  it('opens a live widget as a document that keeps its binding', () => {
    const bind = { title: 'Disk', kicker: 'NAS · LIVE', service: 'nas', action: 'disk', everySec: 10, template: [] }
    const id = insertWidget(boundWidget(bind), 'R', 0)
    expandWidget(id)
    expect(isOpen('doc')).toBe(true)
    expect(docs.current).toMatchObject({ title: 'Disk', bind })
  })

  it('keeps to four windows, closing the oldest', () => {
    for (const id of ['services', 'logs', 'cameras', 'calendar']) open(id)
    expandWidget('w1')
    expect(openIds()).toEqual(['logs', 'cameras', 'calendar', 'telemetry'])
  })

  it('focuses the window when it is already open, without opening a second one', () => {
    const id = insertWidget(services(), 'R', 0)
    open('services')
    open('logs')
    expandWidget(id)
    expect(wm.active).toBe('services')
    settle()
    expect(dock.widgets[id]).toBeUndefined()
    expect(openIds()).toHaveLength(2)
  })

  it('keeps a widget that has no window to go back to', () => {
    const id = insertWidget({ ...tele(), type: 'unknown' }, 'R', 0)
    expandWidget(id)
    settle()
    expect(dock.widgets[id]).toBeDefined()
    expect(openIds()).toEqual([])
  })
})
