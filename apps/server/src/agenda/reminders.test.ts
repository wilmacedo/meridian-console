import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { ScreenCommand } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { REPEAT_MS, Reminders, review } from './reminders.js'
import { AgendaSettings, TodoStore } from './todos.js'

const T0 = new Date('2026-10-12T09:00:00').getTime()
const MIN = 60_000

function setup(options: { screen?: boolean; inCar?: boolean } = {}) {
  const db = new DatabaseSync(':memory:')
  const todos = new TodoStore(db)
  const settings = new AgendaSettings(db)
  const clock = { now: T0 }
  const shown: { workspace: string; command: ScreenCommand; screen?: string }[] = []
  const announced: { text: string; workspace: string; screen?: string }[] = []
  const ran: unknown[][] = []
  const reminders = new Reminders({
    todos,
    settings,
    registry: { run: async (...args) => (ran.push(args), { ms: 1, result: { ok: true } }) },
    screens: {
      dispatch: (workspace, command, screen) => (shown.push({ workspace, command, screen }), true),
      reach: (workspace, client) => (options.screen === false ? undefined : workspace === 'default' && client === 'tab-a' ? { workspace, client } : { workspace: 'office', client: 'tab-z' }),
    },
    bus: new EventBus(),
    announce: (text, workspace, screen) => announced.push({ text, workspace, screen }),
    lastScreen: () => ({ workspace: 'default', screen: 'tab-a' }),
    inCar: () => options.inCar ?? false,
    now: () => clock.now,
  })
  const at = (ms: number) => {
    clock.now = ms
    reminders.tick()
  }
  return { todos, settings, reminders, shown, announced, ran, at, clock }
}

describe('Reminders', () => {
  it('does nothing before the moment the owner set', () => {
    const { todos, at, announced } = setup()
    todos.add({ title: 'Ligar pro mecânico', remindAt: T0 + 10 * MIN }, T0)
    at(T0 + 9 * MIN)
    expect(announced).toEqual([])
  })

  it('at the moment, shows it and has NOX say it on the screen the owner used last, once', () => {
    const { todos, at, announced, shown } = setup()
    const t = todos.add({ title: 'Ligar pro mecânico', notes: 'Oficina do Zé', remindAt: T0 + 10 * MIN }, T0)
    at(T0 + 10 * MIN)
    at(T0 + 10 * MIN + 15_000)
    expect(announced).toHaveLength(1)
    expect(announced[0]).toMatchObject({ workspace: 'default', screen: 'tab-a' })
    expect(announced[0].text).toMatch(/^\[reminder due\] A reminder the owner set is due:\n- t-[0-9a-f]{4} "Ligar pro mecânico"; notes: Oficina do Zé/)
    expect(announced[0].text).toContain('one or two short sentences')
    expect(shown[0]).toMatchObject({ workspace: 'default', screen: 'tab-a', command: { name: 'compose_doc', doc: { id: 'reminders', title: 'Lembrete' } } })
    expect(todos.get(t.id)).toMatchObject({ firedAt: T0 + 10 * MIN, repeatAt: T0 + 10 * MIN + REPEAT_MS })
    expect(todos.get(t.id)?.remindAt).toBeUndefined()
    expect(todos.history(t.id).map((h) => h.what)).toEqual(['created', 'fired'])
  })

  it('keeps it to a very short sentence in the car', () => {
    const { todos, at, announced } = setup({ inCar: true })
    todos.add({ title: 'Comprar pão', remindAt: T0 }, T0)
    at(T0)
    expect(announced[0].text).toContain('they are driving')
  })

  it('also shows a notification where one is set, with the words filled in', () => {
    const { todos, settings, at, ran } = setup()
    settings.setChannels({ toast: { service: 'devices', action: 'device_call', input: { device: 'pc', capability: 'notify', input: { title: '{title}', text: '{text}' } } } })
    todos.add({ title: 'Comprar pão', remindAt: T0 }, T0)
    at(T0)
    expect(ran).toEqual([['devices', 'device_call', { device: 'pc', capability: 'notify', input: { title: 'Lembrete', text: 'Comprar pão' } }]])
  })

  it('with no screen open, sends it as a note instead of speaking', () => {
    const { todos, settings, at, ran, announced } = setup({ screen: false })
    settings.setChannels({ note: { service: 'whatsapp', action: 'note-to-self' } })
    todos.add({ title: 'Comprar pão', remindAt: T0 }, T0)
    at(T0)
    expect(announced).toEqual([])
    expect(ran).toEqual([['whatsapp', 'note-to-self', { text: 'Lembrete: Comprar pão' }]])
  })

  it('repeats an unanswered reminder once, ten minutes later, on WhatsApp when it is set', () => {
    const { todos, settings, at, ran, announced } = setup()
    settings.setChannels({ note: { service: 'whatsapp', action: 'note-to-self' } })
    const t = todos.add({ title: 'Comprar pão', remindAt: T0 }, T0)
    at(T0)
    at(T0 + REPEAT_MS)
    at(T0 + 3 * REPEAT_MS)
    expect(announced).toHaveLength(1)
    expect(ran).toEqual([['whatsapp', 'note-to-self', { text: 'Lembrete: Comprar pão' }]])
    expect(todos.get(t.id)?.repeatAt).toBeUndefined()
  })

  it('repeats on the screen when there is no WhatsApp channel', () => {
    const { todos, at, announced } = setup()
    todos.add({ title: 'Comprar pão', remindAt: T0 }, T0)
    at(T0)
    at(T0 + REPEAT_MS)
    expect(announced[1].text).toContain('did not answer this reminder ten minutes ago')
  })

  it('moves a repeating reminder to its next time when it goes off', () => {
    const { todos, at } = setup()
    const t = todos.add({ title: 'Tomar o remédio', remindAt: T0, recurrence: 'FREQ=DAILY', anchorAt: T0 }, T0)
    at(T0 + 30_000)
    expect(todos.get(t.id)).toMatchObject({ status: 'open', remindAt: T0 + 24 * 60 * MIN })
  })

  it('says what came due while the server was down, together, with when each was due', () => {
    const { todos, at, announced } = setup()
    todos.add({ title: 'Pagar o IPVA', remindAt: T0 }, T0 - MIN)
    todos.add({ title: 'Ligar pro Zé', remindAt: T0 + 5 * MIN }, T0 - MIN)
    at(T0 + 60 * MIN)
    expect(announced).toHaveLength(1)
    expect(announced[0].text).toContain('These reminders the owner set are due')
    expect(announced[0].text).toContain('"Pagar o IPVA"; it was due at 2026-10-12 09:00')
    expect(announced[0].text).toContain('"Ligar pro Zé"; it was due at 2026-10-12 09:05')
  })
})

describe('review', () => {
  it('sorts the open list into late, today, most put off and waiting without a date', () => {
    const { todos } = setup()
    todos.add({ title: 'Prazo vencido', dueAt: T0 - 60 * MIN }, T0 - 120 * MIN)
    const ignored = todos.add({ title: 'Lembrete tocado', remindAt: T0 - MIN }, T0 - 120 * MIN)
    todos.update(ignored.id, { firedAt: T0 - MIN, remindAt: null }, T0 - MIN)
    todos.add({ title: 'Hoje à tarde', remindAt: T0 + 6 * 60 * MIN }, T0)
    const putOff = todos.add({ title: 'Levar o carro', remindAt: T0 + 2 * 24 * 60 * MIN }, T0)
    todos.update(putOff.id, { postponed: 4 }, T0)
    todos.add({ title: 'Ver o seguro' }, T0)
    const r = review(todos.list('open'), T0) as Record<string, { title: string }[] & { count: number; items: { title: string }[] }>
    expect(r.late.map((t) => t.title)).toEqual(['Prazo vencido', 'Lembrete tocado'])
    expect(r.today.map((t) => t.title)).toEqual(['Hoje à tarde'])
    expect(r.mostPutOff.map((t) => t.title)).toEqual(['Levar o carro'])
    expect(r.waitingWithoutDate).toEqual({ count: 1, items: [expect.objectContaining({ title: 'Ver o seguro' })] })
  })
})
