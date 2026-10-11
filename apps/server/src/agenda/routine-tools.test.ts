import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ScreenCommand, ServiceSummary } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { routineTools } from './routine-tools.js'
import { RoutineStore, type Routine, type RoutineRun } from './routines.js'

const services: ServiceSummary[] = [
  { id: 'calendar', name: 'calendar', mono: 'CA', desc: '', status: { state: 'online' }, emitsEvents: false, actions: [{ id: 'list-events', method: 'GET', path: '/x', title: 't', description: '', mutating: false }] },
]

const bomDia = {
  id: 'bom-dia',
  name: 'Bom dia',
  triggers: [{ kind: 'phrase', phrases: ['bom dia'], window: { from: '05:00', to: '12:00' } }],
  steps: [{ id: 'agenda', kind: 'action', title: 'Agenda de hoje', service: 'calendar', action: 'list-events' }],
}

function setup(clock = '07:30') {
  const store = new RoutineStore(new DatabaseSync(':memory:'))
  const shown: ScreenCommand[] = []
  const runs: { routine: Routine; trigger: RoutineRun['trigger']; workspace: string; screen?: string }[] = []
  const tools = routineTools({
    store,
    profiles: async () => ['pessoal', 'trabalho'],
    runner: {
      run: async (routine, trigger, workspace, screen) => {
        runs.push({ routine, trigger, workspace, screen })
        return { id: 'abc', routineId: routine.id, trigger, startedAt: 0, state: 'running', steps: [] }
      },
    },
    registry: { summaries: () => services },
    screens: { dispatch: (_w, command) => (shown.push(command), true) },
    bus: new EventBus(),
    currentWorkspace: () => 'default',
    currentScreen: () => 'tab-a',
    now: () => new Date(`2026-10-12T${clock}:00`),
  })
  const call = (name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.handler(args)
  return { store, shown, runs, call }
}

describe('routine tools', () => {
  it('shows a draft without saving it, and saves only when asked', async () => {
    const { store, shown, call } = setup()
    expect(await call('preview_routine', { routine: bomDia })).toContain('Nothing is saved yet')
    expect(store.list()).toEqual([])
    expect(shown[0]).toMatchObject({ name: 'compose_doc', doc: { id: 'routine-bom-dia', title: 'Bom dia', kicker: 'ROTINA · RASCUNHO' } })
    expect(await call('save_routine', { routine: bomDia })).toBe('Saved the routine "Bom dia".')
    expect(store.get('bom-dia')?.version).toBe(1)
    expect(shown[1]).toMatchObject({ doc: { id: 'routine-bom-dia', kicker: 'ROTINA · SALVA' } })
    expect(await call('save_routine', { routine: { ...bomDia, name: 'Bom dia!' } })).toBe('Updated the routine "Bom dia!".')
  })

  it('lists nothing until the owner has made a routine', async () => {
    const { call } = setup()
    expect(await call('list_routines', {})).toBe('The owner has no routines yet.')
  })

  it('runs a routine by its phrase at once inside its window, on the screen that asked', async () => {
    const { call, runs } = setup()
    await call('save_routine', { routine: bomDia })
    expect(await call('run_routine', { id: 'bom-dia', how: 'phrase', heard: 'bom dia nox' })).toContain('is running')
    expect(runs[0]).toMatchObject({ trigger: { kind: 'phrase', heard: 'bom dia nox' }, workspace: 'default', screen: 'tab-a' })
  })

  it('refuses a phrase outside the window until the owner agrees, but not a request by name', async () => {
    const { call, runs } = setup('15:00')
    await call('save_routine', { routine: bomDia })
    await expect(call('run_routine', { id: 'bom-dia', how: 'phrase' })).rejects.toThrow('Not run: it is 15:00, outside its time window')
    expect(runs).toEqual([])
    await call('run_routine', { id: 'bom-dia', how: 'phrase', confirmed: true })
    await call('run_routine', { id: 'bom-dia', how: 'by_name' })
    expect(runs.map((r) => r.trigger.kind)).toEqual(['phrase', 'by_name'])
  })

  it('deletes a routine and names an unknown one', async () => {
    const { call, store } = setup()
    await call('save_routine', { routine: bomDia })
    expect(await call('delete_routine', { id: 'bom-dia' })).toBe('Deleted the routine "Bom dia".')
    expect(store.list()).toEqual([])
    await expect(call('run_routine', { id: 'bom-dia', how: 'by_name' })).rejects.toThrow('no routine "bom-dia"')
  })
})
