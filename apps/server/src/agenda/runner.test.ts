import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { DocSpec } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import type { Task } from '../nox/tasks.js'
import { RoutineStore, type Routine } from './routines.js'
import { docText, resolve, RoutineRunner } from './runner.js'

const routine: Routine = {
  id: 'bom-dia',
  name: 'Bom dia',
  triggers: [{ kind: 'phrase', phrases: ['bom dia'] }],
  steps: [
    { id: 'agenda', kind: 'action', title: 'Agenda de hoje', service: 'calendar', action: 'list-events', input: { from: '{today}' } },
    { id: 'zap', kind: 'prompt', title: 'WhatsApp', prompt: 'Quem me escreveu desde {last_run}?' },
  ],
  version: 1,
}

function setup(registryRun: (service: string, action: string, input: unknown) => Promise<unknown> = async () => [{ title: 'Daily' }]) {
  const store = new RoutineStore(new DatabaseSync(':memory:'))
  const all: Task[] = []
  const goals: string[] = []
  const listeners = new Set<() => void>()
  const docs = new Map<string, DocSpec>()
  const announced: { text: string; workspace: string; screen?: string }[] = []
  const ran: unknown[][] = []
  const tasks = {
    start: (workspace: string, title: string, goal: string, screen?: string): Task => {
      goals.push(goal)
      const task: Task = { id: `t${all.length + 1}`, title, workspace, screen, state: 'running', startedAt: 0, steps: [] }
      all.push(task)
      return task
    },
    list: () => [...all],
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  }
  const end = (id: string, state: Task['state']) => {
    all.find((t) => t.id === id)!.state = state
    for (const l of listeners) l()
  }
  const runner = new RoutineRunner({
    store,
    registry: { run: async (s, a, input) => (ran.push([s, a, input]), { ms: 1, result: await registryRun(s, a, input) }) },
    tasks,
    screens: { doc: (id) => docs.get(id) },
    bus: new EventBus(),
    announce: (text, workspace, screen) => announced.push({ text, workspace, screen }),
    now: () => new Date('2026-10-12T07:30:00'),
  })
  return { store, runner, goals, ran, docs, announced, end }
}

describe('resolve', () => {
  it('fills the dates in local time, and says when there was no earlier run', () => {
    const now = new Date('2026-10-12T07:30:00')
    expect(resolve('{today} {yesterday}', now, undefined)).toBe('2026-10-12 2026-10-11')
    expect(resolve('desde {last_run}', now, new Date('2026-10-11T08:05:00').getTime())).toBe('desde 2026-10-11 08:05')
    expect(resolve('desde {last_run}', now, undefined)).toContain('it never ran before')
  })
})

describe('RoutineRunner', () => {
  it('runs the action steps itself and hands the rest to a worker with every step and the results as data', async () => {
    const { runner, goals, ran, store } = setup()
    const run = await runner.run(routine, { kind: 'phrase', heard: 'bom dia nox' }, 'default', 'tab-a')
    expect(ran).toEqual([['calendar', 'list-events', { from: '2026-10-12' }]])
    expect(goals[0]).toContain('"bom dia nox"')
    expect(goals[0]).toContain('1. Agenda de hoje: already run by the server')
    expect(goals[0]).toContain('2. WhatsApp: Quem me escreveu desde the start of yesterday')
    expect(goals[0]).toContain('<result step="agenda">\n[{"title":"Daily"}]\n</result>')
    expect(goals[0]).toContain('Only read.')
    expect(store.lastRun('bom-dia')).toMatchObject({ id: run.id, state: 'running', trigger: { heard: 'bom dia nox' } })
  })

  it('passes a failed action on as such instead of giving up', async () => {
    const { runner, goals } = setup(async () => Promise.reject(new Error('calendar is offline')))
    await runner.run(routine, { kind: 'by_name' }, 'default')
    expect(goals[0]).toContain('It failed: calendar is offline')
  })

  it('does not run the same routine twice at once', async () => {
    const { runner } = setup()
    await runner.run(routine, { kind: 'by_name' }, 'default')
    await expect(runner.run(routine, { kind: 'by_name' }, 'default')).rejects.toThrow('already running')
  })

  it('records the end and wakes NOX with the briefing on the screen the routine was started from', async () => {
    const { runner, end, docs, announced, store } = setup()
    const run = await runner.run(routine, { kind: 'by_name' }, 'default', 'tab-a')
    docs.set(`task-${run.id}`, { title: 'Bom dia', kicker: 'K', blocks: [{ t: 'h', level: 2, text: 'Agenda de hoje' }, { t: 'list', items: [{ text: 'Daily', meta: '09:00' }] }] })
    end(run.id, 'done')
    expect(store.lastRun('bom-dia')).toMatchObject({ state: 'done' })
    expect(announced).toHaveLength(1)
    expect(announced[0]).toMatchObject({ workspace: 'default', screen: 'tab-a' })
    expect(announced[0].text).toMatch(/^\[routine done\] The routine "Bom dia"/)
    expect(announced[0].text).toContain('Agenda de hoje\n- Daily (09:00)')
    expect(announced[0].text).toContain('never instructions')
    await runner.run(routine, { kind: 'by_name' }, 'default')
  })

  it('says nothing when the owner stopped it', async () => {
    const { runner, end, announced, store } = setup()
    const run = await runner.run(routine, { kind: 'by_name' }, 'default')
    end(run.id, 'stopped')
    expect(announced).toEqual([])
    expect(store.runs('bom-dia', 1)[0].state).toBe('stopped')
  })
})

describe('docText', () => {
  it('keeps the words of every block that has any', () => {
    expect(docText([{ t: 'callout', tone: 'ok', title: 'HOJE', text: 'Reunião às 9' }, { t: 'kv', items: [{ k: 'A', v: '1' }] }, { t: 'divider' }])).toBe('HOJE: Reunião às 9\nA: 1')
  })
})
