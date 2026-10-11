import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ServiceSummary } from '@meridian/service-sdk'
import { RoutineStore, validateRoutine, type Routine } from './routines.js'

const action = (id: string, extra: Partial<ServiceSummary['actions'][number]> = {}): ServiceSummary['actions'][number] => ({ id, method: 'GET', path: `/${id}`, title: id, description: '', mutating: false, ...extra })
const services: ServiceSummary[] = [
  { id: 'calendar', name: 'calendar', mono: 'CA', desc: '', status: { state: 'online' }, emitsEvents: false, actions: [action('list-events'), action('create-event', { mutating: true })] },
  { id: 'devices', name: 'devices', mono: 'DE', desc: '', status: { state: 'online' }, emitsEvents: false, actions: [action('browser_click', { gated: true })] },
]

const bomDia = {
  id: 'bom-dia',
  name: 'Bom dia',
  triggers: [{ kind: 'phrase', phrases: ['bom dia', 'vamos começar o dia'], window: { from: '05:00', to: '12:00' } }],
  steps: [
    { id: 'agenda', kind: 'action', title: 'Agenda de hoje', service: 'calendar', action: 'list-events', input: { from: '{today}' } },
    { id: 'ontem', kind: 'prompt', title: 'O que fiz ontem', prompt: 'Quais reuniões eu tive em {yesterday}?' },
  ],
}

const withSteps = (steps: unknown[]) => ({ ...bomDia, steps })

describe('validateRoutine', () => {
  it('accepts a routine and stamps the current version', () => {
    expect(validateRoutine(bomDia, services, [])).toEqual({ ...bomDia, version: 1 })
  })

  it('says what is wrong, by path, in words NOX can act on', () => {
    expect(() => validateRoutine({ ...bomDia, id: 'Bom Dia' }, services, [])).toThrow('routine.id must be kebab-case')
    expect(() => validateRoutine({ ...bomDia, triggers: [] }, services, [])).toThrow('routine.triggers must have 1 to 4 items')
    expect(() => validateRoutine({ ...bomDia, triggers: [{ kind: 'schedule', at: '08:00' }] }, services, [])).toThrow('routine.triggers[0].kind must be "phrase"')
    expect(() => validateRoutine({ ...bomDia, triggers: [{ kind: 'phrase', phrases: ['bom dia'], window: { from: '5h', to: '12:00' } }] }, services, [])).toThrow('local times')
    expect(() => validateRoutine(withSteps([]), services, [])).toThrow('routine.steps must have 1 to 8 items')
    expect(() => validateRoutine(withSteps([{ id: 'x', kind: 'habit', title: 'X' }]), services, [])).toThrow('routine.steps[0].kind must be one of action, prompt, todos')
    expect(() => validateRoutine(withSteps([{ id: 'x', kind: 'prompt', title: 'X' }]), services, [])).toThrow('routine.steps[0].prompt is required')
    expect(() => validateRoutine(withSteps([{ id: 'x', kind: 'action', title: 'X', service: 'mail', action: 'list' }]), services, [])).toThrow('no service "mail"')
    expect(() => validateRoutine(withSteps([{ id: 'x', kind: 'prompt', title: 'X', prompt: 'p', profile: 'casa' }]), services, [], ['pessoal', 'trabalho'])).toThrow('routine.steps[0].profile must be one of pessoal, trabalho')
    expect(() => validateRoutine(withSteps([bomDia.steps[1], bomDia.steps[1]]), services, [])).toThrow('the id "ontem" is used twice')
  })

  it('lets a prompt step read with one of the owner\'s profiles', () => {
    const r = validateRoutine(withSteps([{ id: 'mail', kind: 'prompt', title: 'E-mails', prompt: 'não lidos desde {last_run}', profile: 'trabalho' }]), services, [], ['pessoal', 'trabalho'])
    expect(r.steps[0]).toEqual({ id: 'mail', kind: 'prompt', title: 'E-mails', prompt: 'não lidos desde {last_run}', profile: 'trabalho' })
  })

  it('refuses steps that could change something, because a routine only reads', () => {
    expect(() => validateRoutine(withSteps([{ id: 'x', kind: 'action', title: 'X', service: 'calendar', action: 'create-event' }]), services, [])).toThrow('a routine only reads')
    expect(() => validateRoutine(withSteps([{ id: 'x', kind: 'action', title: 'X', service: 'devices', action: 'browser_click' }]), services, [])).toThrow('a routine only reads')
  })

  it('refuses a phrase that already starts another routine, ignoring case and accents, but not the routine being changed', () => {
    const saved = validateRoutine(bomDia, services, [])
    const other = { ...bomDia, id: 'trabalho', name: 'Trabalho', triggers: [{ kind: 'phrase', phrases: ['Vamos começar o DIA!'] }] }
    expect(() => validateRoutine(other, services, [saved])).toThrow('already starts the routine "Bom dia" (bom-dia)')
    expect(validateRoutine({ ...bomDia, name: 'Bom dia!' }, services, [saved]).name).toBe('Bom dia!')
  })
})

describe('RoutineStore', () => {
  const routine = validateRoutine(bomDia, services, []) as Routine

  it('keeps, replaces and forgets routines with their runs', () => {
    const store = new RoutineStore(new DatabaseSync(':memory:'))
    store.put(routine)
    store.put({ ...routine, name: 'Bom dia!' })
    expect(store.list().map((r) => r.name)).toEqual(['Bom dia!'])
    store.startRun({ id: 'r1', routineId: 'bom-dia', trigger: { kind: 'by_name' }, startedAt: 1 })
    expect(store.delete('bom-dia')).toBe(true)
    expect(store.get('bom-dia')).toBeUndefined()
    expect(store.runs('bom-dia', 5)).toEqual([])
  })

  it('counts as the last run only one that is running or got to the end', () => {
    const store = new RoutineStore(new DatabaseSync(':memory:'))
    store.startRun({ id: 'a', routineId: 'bom-dia', trigger: { kind: 'phrase', heard: 'bom dia' }, startedAt: 100 })
    store.finishRun('a', 'done', [{ label: 'Agenda de hoje', state: 'done' }], 150)
    store.startRun({ id: 'b', routineId: 'bom-dia', trigger: { kind: 'by_name' }, startedAt: 200 })
    store.finishRun('b', 'failed', [], 250)
    expect(store.lastRun('bom-dia')).toMatchObject({ id: 'a', state: 'done', finishedAt: 150, trigger: { heard: 'bom dia' }, steps: [{ label: 'Agenda de hoje' }] })
    expect(store.runs('bom-dia', 5).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('marks a run that was going when the server went down as interrupted', () => {
    const db = new DatabaseSync(':memory:')
    new RoutineStore(db).startRun({ id: 'a', routineId: 'bom-dia', trigger: { kind: 'by_name' }, startedAt: 100 })
    const store = new RoutineStore(db)
    store.interruptRunning(500)
    expect(store.runs('bom-dia', 1)[0]).toMatchObject({ state: 'interrupted', finishedAt: 500 })
    expect(store.lastRun('bom-dia')).toBeUndefined()
  })
})
