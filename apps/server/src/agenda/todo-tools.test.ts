import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ServiceSummary } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { todoTools } from './todo-tools.js'
import { AgendaSettings, TodoStore } from './todos.js'

const T0 = new Date('2026-10-12T09:00:00').getTime()
const iso = (ms: number) => new Date(ms).toISOString()
const HOUR = 3_600_000

const action = (id: string, extra: Partial<ServiceSummary['actions'][number]> = {}): ServiceSummary['actions'][number] => ({ id, method: 'POST', path: `/${id}`, title: id, description: '', mutating: false, ...extra })
const services: ServiceSummary[] = [
  { id: 'devices', name: 'devices', mono: 'DE', desc: '', status: { state: 'online' }, emitsEvents: false, actions: [action('device_call', { gated: true })] },
  { id: 'whatsapp', name: 'whatsapp', mono: 'WA', desc: '', status: { state: 'online' }, emitsEvents: false, actions: [action('note-to-self'), action('send-message', { mutating: true })] },
]

function setup() {
  const db = new DatabaseSync(':memory:')
  const todos = new TodoStore(db)
  const settings = new AgendaSettings(db)
  const clock = { now: T0 }
  const tools = todoTools({ todos, settings, registry: { summaries: () => services }, bus: new EventBus(), now: () => clock.now })
  const call = async (name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.handler(args)
  const add = async (args: Record<string, unknown>) => (JSON.parse(await call('add_todo', args)) as { added: { id: string } }).added
  return { todos, settings, clock, call, add }
}

describe('todo tools', () => {
  it('notes a task with or without a moment', async () => {
    const { add, todos } = setup()
    const t = await add({ title: 'Ligar pro mecânico', remind_at: iso(T0 + HOUR), notes: 'Oficina do Zé' })
    expect(t).toMatchObject({ title: 'Ligar pro mecânico', remindAt: '2026-10-12 10:00', notes: 'Oficina do Zé' })
    expect(todos.get(t.id)).toMatchObject({ status: 'open', remindAt: T0 + HOUR, source: 'voice' })
    expect((await add({ title: 'Ver o seguro' })) as object).not.toHaveProperty('remindAt')
  })

  it('refuses a moment in the past, saying what time it is, and a rule it does not understand', async () => {
    const { call } = setup()
    await expect(call('add_todo', { title: 'X', remind_at: iso(T0 - HOUR) })).rejects.toThrow('remind_at is in the past (2026-10-12 08:00); it is 2026-10-12 09:00')
    await expect(call('add_todo', { title: 'X', remind_at: 'amanhã' })).rejects.toThrow('ISO 8601')
    await expect(call('add_todo', { title: 'X', recurrence: 'FREQ=DAILY' })).rejects.toThrow('needs remind_at')
    await expect(call('add_todo', { title: 'X', remind_at: iso(T0 + HOUR), recurrence: 'every day' })).rejects.toThrow('is not supported; use FREQ')
  })

  it('counts every snooze and, from the third, tells NOX to offer help', async () => {
    const { add, call, todos } = setup()
    const t = await add({ title: 'Levar o carro', remind_at: iso(T0 + HOUR) })
    expect(await call('snooze_todo', { id: t.id, until: iso(T0 + 2 * HOUR) })).toBe('Put off to 2026-10-12 11:00.')
    await call('snooze_todo', { id: t.id, until: iso(T0 + 3 * HOUR) })
    expect(await call('snooze_todo', { id: t.id, until: iso(T0 + 4 * HOUR) })).toContain('time number 3 it was put off')
    expect(todos.get(t.id)).toMatchObject({ postponed: 3, remindAt: T0 + 4 * HOUR })
  })

  it('finishes and drops tasks, and will not touch one that is closed', async () => {
    const { add, call, todos } = setup()
    const a = await add({ title: 'Pagar o IPVA', remind_at: iso(T0 + HOUR) })
    expect(await call('complete_todo', { id: a.id })).toBe('Done: "Pagar o IPVA".')
    expect(todos.get(a.id)).toMatchObject({ status: 'done', doneAt: T0 })
    expect(todos.get(a.id)?.remindAt).toBeUndefined()
    await expect(call('complete_todo', { id: a.id })).rejects.toThrow('is already done')
    const b = await add({ title: 'Ver o seguro' })
    expect(await call('drop_todo', { id: b.id })).toBe('Dropped: "Ver o seguro".')
    expect(JSON.parse(await call('list_todos', { status: 'all' })).todos).toHaveLength(2)
    expect(await call('list_todos', {})).toBe('No open tasks.')
  })

  it('keeps a repeating reminder going: an answer leaves the next time, done ahead of time skips one', async () => {
    const { add, call, todos, clock } = setup()
    const t = await add({ title: 'Tomar o remédio', remind_at: iso(T0 + HOUR), recurrence: 'freq=daily' })
    expect(todos.get(t.id)).toMatchObject({ recurrence: 'FREQ=DAILY', anchorAt: T0 + HOUR })
    // Ahead of time, before today's reminder went off: tomorrow's is next.
    expect(await call('complete_todo', { id: t.id })).toBe('Done for this time. Next reminder: 2026-10-13 10:00.')
    // Tomorrow it goes off (the scheduler moves it on) and the owner answers.
    clock.now = T0 + 25 * HOUR
    todos.update(t.id, { firedAt: clock.now, repeatAt: clock.now + 600_000, remindAt: T0 + 49 * HOUR }, clock.now)
    expect(await call('complete_todo', { id: t.id })).toBe('Done for this time. Next reminder: 2026-10-14 10:00.')
    expect(todos.get(t.id)?.status).toBe('open')
  })

  it('changes a task and clears what is given as null', async () => {
    const { add, call, todos } = setup()
    const t = await add({ title: 'Ligar', remind_at: iso(T0 + HOUR), notes: 'x' })
    await call('update_todo', { id: t.id, title: 'Ligar pro Zé', notes: null, remind_at: null })
    expect(todos.get(t.id)).toMatchObject({ title: 'Ligar pro Zé' })
    expect(todos.get(t.id)?.notes).toBeUndefined()
    expect(todos.get(t.id)?.remindAt).toBeUndefined()
  })

  it('sets where reminders also go, refusing an action that changes something', async () => {
    const { call, settings } = setup()
    await call('configure_reminders', { toast: { service: 'devices', action: 'device_call', input: { device: 'pc', capability: 'notify', input: { title: '{title}', text: '{text}' } } }, note: { service: 'whatsapp', action: 'note-to-self' } })
    expect(settings.channels()).toMatchObject({ toast: { service: 'devices' }, note: { action: 'note-to-self' } })
    await expect(call('configure_reminders', { note: { service: 'whatsapp', action: 'send-message' } })).rejects.toThrow('changes something')
    await call('configure_reminders', { toast: null })
    expect(settings.channels()).toEqual({ note: { service: 'whatsapp', action: 'note-to-self' } })
  })
})
