import type { DocSpec } from '@meridian/service-sdk'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import { clockOf, dayOf } from './match.js'
import { nextOccurrence, parseRule } from './recurrence.js'
import type { AgendaSettings, Todo, TodoStore } from './todos.js'

// Delivers the reminders the owner set, at the moment they set: spoken by NOX on the screen the owner used last,
// as a notification where one is configured, and on WhatsApp when no screen is there. A reminder nobody answers
// is repeated once, ten minutes later, and then waits for the next review. Nothing else is ever sent on its own.

const TICK_MS = 15_000
export const REPEAT_MS = 10 * 60_000
// Later than this and the owner is told when it was due (the server was down, say).
const LATE_MS = 2 * 60_000
// The third time a reminder is put off, NOX stops just postponing it and offers help.
export const POSTPONE_HELP = 3

interface ReminderDeps {
  todos: TodoStore
  settings: AgendaSettings
  registry: Pick<Registry, 'run'>
  screens: Pick<ScreenRegistry, 'dispatch' | 'reach'>
  bus: EventBus
  announce: (text: string, workspace: string, screen?: string) => void
  // The screen the owner talked to last.
  lastScreen: () => { workspace: string; screen?: string } | undefined
  inCar: (workspace: string) => boolean
  now?: () => number
}

export const when = (ms: number): string => `${dayOf(new Date(ms))} ${clockOf(new Date(ms))}`

// Fills "{title}" and "{text}" anywhere in a channel's input.
function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') return value.replace(/\{(title|text)\}/g, (_, k: string) => vars[k])
  if (Array.isArray(value)) return value.map((v) => fill(v, vars))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]))
  return value
}

function reminderDoc(todos: Todo[]): DocSpec {
  return {
    id: 'reminders',
    title: todos.length > 1 ? 'Lembretes' : 'Lembrete',
    kicker: 'LEMBRETE',
    blocks: todos.length > 1 ? [{ t: 'list', items: todos.map((t) => ({ text: t.title, meta: t.notes?.slice(0, 60), state: 'todo' as const })) }] : [{ t: 'callout', tone: 'warn', title: 'AGORA', text: todos[0].title }, ...(todos[0].notes ? [{ t: 'p' as const, text: todos[0].notes }] : [])],
  }
}

// What NOX reads about a reminder: enough to say it and to act on the owner's answer.
function described(t: Todo): string {
  return [
    `${t.id} "${t.title}"`,
    t.notes && `notes: ${t.notes}`,
    t.postponed > 0 && `put off ${t.postponed} time${t.postponed > 1 ? 's' : ''}`,
    t.recurrence && 'recurring',
  ]
    .filter(Boolean)
    .join('; ')
}

export class Reminders {
  private timer?: ReturnType<typeof setInterval>
  private now: () => number

  constructor(private d: ReminderDeps) {
    this.now = d.now ?? Date.now
  }

  start(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
  }

  // Fires what is due and repeats what went unanswered. Exposed for tests and for after a change.
  tick(): void {
    const now = this.now()
    const { fire, repeat } = this.d.todos.due(now)
    const fired = fire.map((t) => this.fire(t, now))
    if (fired.length) this.deliver(fired, now)
    for (const t of repeat.filter((r) => !fire.some((f) => f.id === r.id))) this.repeat(t, now)
  }

  private fire(t: Todo, now: number): Todo & { lateBy: number } {
    const lateBy = now - t.remindAt!
    const next = t.recurrence ? nextOccurrence(parseRule(t.recurrence), new Date(t.anchorAt ?? t.remindAt!), new Date(now)).getTime() : null
    const updated = this.d.todos.update(t.id, { firedAt: now, repeatAt: now + REPEAT_MS, remindAt: next }, now)
    this.d.todos.log(t.id, 'fired', next ? `next ${when(next)}` : undefined, now)
    this.d.bus.emit('nox', 'info', `reminder ${t.id} due: ${t.title.slice(0, 80)}`)
    return { ...updated, lateBy }
  }

  private target(): { workspace: string; screen?: string } | undefined {
    const last = this.d.lastScreen()
    const reached = this.d.screens.reach(last?.workspace, last?.screen)
    return reached && { workspace: reached.workspace, screen: reached.client }
  }

  private deliver(due: (Todo & { lateBy: number })[], now: number): void {
    const target = this.target()
    if (target) {
      this.d.screens.dispatch(target.workspace, { name: 'compose_doc', doc: reminderDoc(due) }, target.screen)
      const lines = due.map((t) => `- ${described(t)}${t.lateBy > LATE_MS ? `; it was due at ${when(now - t.lateBy)} and could not be said then` : ''}`)
      const car = this.d.inCar(target.workspace)
      this.d.announce(
        `[reminder due] ${due.length > 1 ? 'These reminders the owner set are due' : 'A reminder the owner set is due'}:\n${lines.join('\n')}\n` +
          `Remind them now in ${car ? 'a very short sentence: they are driving' : 'one or two short sentences'}, and wait for their answer: done means complete_todo, another time means snooze_todo, dropping it means drop_todo.`,
        target.workspace,
        target.screen,
      )
    }
    this.toast(due)
    if (!target) this.note(due)
  }

  // The one repeat: on WhatsApp when it is configured, so it reaches the owner away from the screen; on the
  // screen otherwise.
  private repeat(t: Todo, now: number): void {
    this.d.todos.update(t.id, { repeatAt: null }, now)
    this.d.todos.log(t.id, 'repeated', undefined, now)
    if (this.d.settings.channels().note) return this.note([t])
    const target = this.target()
    if (target) this.d.announce(`[reminder due] The owner did not answer this reminder ten minutes ago; say it once more, briefly: ${described(t)}.`, target.workspace, target.screen)
  }

  private toast(due: Todo[]): void {
    const toast = this.d.settings.channels().toast
    if (!toast) return
    const vars = { title: due.length > 1 ? `${due.length} lembretes` : 'Lembrete', text: due.map((t) => t.title).join(' · ').slice(0, 300) }
    this.send('notification', toast.service, toast.action, fill(toast.input, vars))
  }

  private note(due: Todo[]): void {
    const note = this.d.settings.channels().note
    if (!note) return
    this.send('note', note.service, note.action, { text: `${due.length > 1 ? 'Lembretes' : 'Lembrete'}: ${due.map((t) => t.title).join('; ')}`.slice(0, 500) })
  }

  private send(what: string, service: string, action: string, input: unknown): void {
    this.d.registry.run(service, action, input).catch((err: unknown) => this.d.bus.emit('nox', 'warn', `reminder ${what} via ${service}/${action} failed: ${err instanceof Error ? err.message : 'unknown error'}`))
  }
}

// What a routine's review step shows: late, today's, the most put off, and what waits without a date.
export function review(todos: Todo[], now: number): Record<string, unknown> {
  const today = dayOf(new Date(now))
  const open = todos.filter((t) => t.status === 'open')
  const brief = (t: Todo) => ({ id: t.id, title: t.title, ...(t.remindAt ? { remindAt: when(t.remindAt) } : {}), ...(t.dueAt ? { dueAt: when(t.dueAt) } : {}), ...(t.postponed ? { postponed: t.postponed } : {}) })
  const late = open.filter((t) => (t.dueAt !== undefined && t.dueAt < now) || (t.firedAt !== undefined && t.remindAt === undefined && !t.recurrence))
  const forToday = open.filter((t) => !late.includes(t) && [t.remindAt, t.dueAt].some((m) => m !== undefined && dayOf(new Date(m)) === today))
  const undated = open.filter((t) => t.remindAt === undefined && t.dueAt === undefined && t.firedAt === undefined)
  return {
    late: late.map(brief),
    today: forToday.map(brief),
    mostPutOff: open.filter((t) => t.postponed >= 2).sort((a, b) => b.postponed - a.postponed).slice(0, 3).map(brief),
    waitingWithoutDate: { count: undated.length, items: undated.slice(0, 10).map(brief) },
  }
}
