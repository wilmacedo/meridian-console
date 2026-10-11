import type { ServiceSummary } from '@meridian/service-sdk'
import type { EventBus } from '../event-bus.js'
import type { Registry } from '../service-registry.js'
import type { McpTool } from '../nox/mcp.js'
import { fail, object, text } from './fields.js'
import { nextOccurrence, parseRule } from './recurrence.js'
import { POSTPONE_HELP, when } from './reminders.js'
import type { AgendaSettings, ReminderChannels, Todo, TodoStore } from './todos.js'

interface TodoToolDeps {
  todos: TodoStore
  settings: AgendaSettings
  registry: Pick<Registry, 'summaries'>
  bus: EventBus
  now?: () => number
}

// How long after a reminder went off a "done" is taken as the answer to it.
const ANSWER_WINDOW_MS = 12 * 3_600_000
const MOMENT = 'ISO 8601 with the UTC offset, for example "2026-10-12T09:00:00-03:00"'

function moment(raw: unknown, key: string): number | null | undefined {
  if (raw === undefined || raw === null) return raw
  const ms = typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isNaN(ms) ? fail(`${key} must be ${MOMENT}`) : ms
}

const recurrenceOf = (raw: unknown): string | null | undefined => {
  if (raw === undefined || raw === null) return raw
  if (typeof raw !== 'string') return fail('recurrence must be a string')
  parseRule(raw)
  return raw.toUpperCase()
}

// What NOX reads about a task, in local time.
const shown = (t: Todo) => ({
  id: t.id,
  title: t.title,
  ...(t.notes ? { notes: t.notes } : {}),
  status: t.status,
  ...(t.remindAt ? { remindAt: when(t.remindAt) } : {}),
  ...(t.dueAt ? { dueAt: when(t.dueAt) } : {}),
  ...(t.recurrence ? { recurrence: t.recurrence } : {}),
  ...(t.postponed ? { postponed: t.postponed } : {}),
  ...(t.firedAt ? { lastReminded: when(t.firedAt) } : {}),
  ...(t.doneAt ? { doneAt: when(t.doneAt) } : {}),
})

const fields = {
  title: { type: 'string', description: 'A concrete action in Portuguese, starting with a verb: "Ligar pro mecânico".' },
  notes: { type: 'string', description: 'Context worth having when it comes back (who, where, a number).' },
  remind_at: { type: 'string', description: `When to remind the owner, ${MOMENT}. Only a moment the owner gave.` },
  due_at: { type: 'string', description: `A deadline, if the owner gave one, ${MOMENT}.` },
  recurrence: { type: 'string', description: 'For a repeating reminder: FREQ=DAILY, FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR (working days), FREQ=WEEKLY;BYDAY=MO,WE, FREQ=MONTHLY;BYMONTHDAY=5, with INTERVAL=n if needed. remind_at is the first time.' },
}

export function todoTools(d: TodoToolDeps): McpTool[] {
  const now = d.now ?? Date.now
  const find = (id: unknown): Todo => d.todos.get(String(id)) ?? fail(`no task "${String(id)}"; list_todos shows them`)
  const open = (id: unknown): Todo => {
    const t = find(id)
    return t.status === 'open' ? t : fail(`"${t.title}" is already ${t.status}`)
  }
  const future = (ms: number, key: string): number => (ms > now() - 60_000 ? ms : fail(`${key} is in the past (${when(ms)}); it is ${when(now())}`))

  function channel(raw: unknown, kind: keyof ReminderChannels, services: ServiceSummary[]): ReminderChannels[keyof ReminderChannels] {
    const r = object(raw, kind, kind === 'toast' ? ['service', 'action', 'input'] : ['service', 'action'])
    const service = services.find((s) => s.id === text(r, 'service', kind, 40)) ?? fail(`${kind}: no service "${String(r.service)}"`)
    const action = service.actions.find((a) => a.id === text(r, 'action', kind, 60)) ?? fail(`${kind}: ${service.id} has no action "${String(r.action)}"`)
    // Runs with nobody to confirm it: one that changes something as a whole is not a way to notify.
    if (action.mutating) fail(`${kind}: ${service.id}/${action.id} changes something; pick an action that only notifies`)
    if (kind === 'note') return { service: service.id, action: action.id }
    if (typeof r.input !== 'object' || r.input === null || Array.isArray(r.input)) return fail('toast.input must be an object, with "{title}" and "{text}" where the notification text goes')
    return { service: service.id, action: action.id, input: r.input as Record<string, unknown> }
  }

  return [
    {
      name: 'add_todo',
      description:
        'Writes down something the owner has to do, and, when they gave a moment, reminds them then (on the screen they used last, as a notification where one is set, and on WhatsApp when no screen is open). Only for what the owner asked you to note or remind; never on your own.',
      inputSchema: { type: 'object', required: ['title'], properties: fields },
      handler: (a) => {
        const r = object(a, 'task', ['title', 'notes', 'remind_at', 'due_at', 'recurrence'])
        const remindAt = moment(r.remind_at, 'remind_at') ?? undefined
        const recurrence = recurrenceOf(r.recurrence) ?? undefined
        if (recurrence && remindAt === undefined) fail('a repeating reminder needs remind_at, its first time')
        if (remindAt !== undefined) future(remindAt, 'remind_at')
        const todo = d.todos.add(
          {
            title: text(r, 'title', 'task', 120),
            ...(typeof r.notes === 'string' && r.notes.trim() ? { notes: r.notes.trim().slice(0, 500) } : {}),
            ...(remindAt !== undefined ? { remindAt } : {}),
            ...(moment(r.due_at, 'due_at') ? { dueAt: moment(r.due_at, 'due_at')! } : {}),
            ...(recurrence ? { recurrence, anchorAt: remindAt } : {}),
            source: 'voice',
          },
          now(),
        )
        d.bus.emit('nox', 'info', `noted ${todo.id}${todo.remindAt ? ` for ${when(todo.remindAt)}` : ''}`)
        return JSON.stringify({ added: shown(todo) })
      },
    },
    {
      name: 'list_todos',
      description: "The owner's tasks and reminders, open ones by default, with times in local time.",
      inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'done', 'dropped', 'all'] } } },
      handler: (a) => {
        const status = typeof a.status === 'string' && ['open', 'done', 'dropped', 'all'].includes(a.status) ? (a.status as Todo['status'] | 'all') : 'open'
        const list = d.todos.list(status)
        return list.length ? JSON.stringify({ now: when(now()), todos: list.map(shown) }) : `No ${status === 'all' ? '' : `${status} `}tasks.`
      },
    },
    {
      name: 'update_todo',
      description: 'Changes a task: give its id and only what changes; null clears notes, remind_at, due_at or recurrence. When the owner puts a reminder off, use snooze_todo instead.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, ...fields } },
      handler: (a) => {
        const r = object(a, 'task', ['id', 'title', 'notes', 'remind_at', 'due_at', 'recurrence'])
        const t = open(r.id)
        const remindAt = moment(r.remind_at, 'remind_at')
        if (typeof remindAt === 'number') future(remindAt, 'remind_at')
        const recurrence = recurrenceOf(r.recurrence)
        const nextRemind = remindAt === undefined ? t.remindAt : (remindAt ?? undefined)
        const nextRecurrence = recurrence === undefined ? t.recurrence : (recurrence ?? undefined)
        if (nextRecurrence && nextRemind === undefined) fail('a repeating reminder needs remind_at, its first time')
        const changed = d.todos.update(
          t.id,
          {
            ...(r.title !== undefined ? { title: text(r, 'title', 'task', 120) } : {}),
            ...(r.notes !== undefined ? { notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 500) : null } : {}),
            ...(remindAt !== undefined ? { remindAt, repeatAt: null } : {}),
            ...(r.due_at !== undefined ? { dueAt: moment(r.due_at, 'due_at') } : {}),
            ...(recurrence !== undefined || remindAt !== undefined ? { recurrence: nextRecurrence ?? null, anchorAt: nextRecurrence ? nextRemind : null } : {}),
          },
          now(),
        )
        d.todos.log(t.id, 'edited', undefined, now())
        return JSON.stringify({ updated: shown(changed) })
      },
    },
    {
      name: 'complete_todo',
      description: 'Marks a task done. For a repeating reminder it marks this time done and keeps the next ones.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      handler: (a) => {
        const t = open(a.id)
        d.todos.log(t.id, 'done', undefined, now())
        if (t.recurrence) {
          // Answering a reminder that just went off leaves the next time as it is; done ahead of time ("já tomei")
          // skips the time still waiting.
          const answering = t.repeatAt !== undefined || (t.firedAt !== undefined && now() - t.firedAt < ANSWER_WINDOW_MS)
          const next = answering && t.remindAt !== undefined ? t.remindAt : nextOccurrence(parseRule(t.recurrence), new Date(t.anchorAt!), new Date(t.remindAt ?? now())).getTime()
          d.todos.update(t.id, { repeatAt: null, remindAt: next }, now())
          return `Done for this time. Next reminder: ${when(next)}.`
        }
        d.todos.update(t.id, { status: 'done', doneAt: now(), remindAt: null, repeatAt: null }, now())
        return `Done: "${t.title}".`
      },
    },
    {
      name: 'snooze_todo',
      description: 'Puts a reminder off to a later moment the owner gave ("daqui a uma hora", "amanhã cedo"). Counts as putting it off; the answer says when that has happened often enough to offer help.',
      inputSchema: { type: 'object', required: ['id', 'until'], properties: { id: { type: 'string' }, until: { type: 'string', description: `The new moment, ${MOMENT}.` } } },
      handler: (a) => {
        const t = open(a.id)
        const until = future(moment(a.until, 'until') ?? fail(`until must be ${MOMENT}`), 'until')
        const changed = d.todos.update(t.id, { remindAt: until, repeatAt: null, postponed: t.postponed + 1 }, now())
        d.todos.log(t.id, 'snoozed', `to ${when(until)}`, now())
        const help =
          changed.postponed >= POSTPONE_HELP
            ? ` This is time number ${changed.postponed} it was put off: after confirming, offer help in one short sentence instead of just postponing: a time block on the calendar (service_calendar_create-event, which they confirm), a smaller first step, or dropping it.`
            : ''
        return `Put off to ${when(until)}.${help}`
      },
    },
    {
      name: 'drop_todo',
      description: 'Drops a task the owner no longer means to do.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      handler: (a) => {
        const t = open(a.id)
        d.todos.update(t.id, { status: 'dropped', doneAt: now(), remindAt: null, repeatAt: null }, now())
        d.todos.log(t.id, 'dropped', undefined, now())
        return `Dropped: "${t.title}".`
      },
    },
    {
      name: 'configure_reminders',
      description:
        'How reminders reach the owner besides being spoken on the screen, when they ask for it. toast: a service action that shows a notification, with "{title}" and "{text}" in its input where the words go (for the Windows PC: service devices, action device_call, input {"device": "<id from device_list>", "capability": "notify", "input": {"title": "{title}", "text": "{text}"}}). note: a service action that sends the owner a note given {"text"} (service whatsapp, action note-to-self); it is used when no screen is open and for the one repeat. null turns one off. With no arguments it says what is set.',
      inputSchema: { type: 'object', properties: { toast: { type: ['object', 'null'] }, note: { type: ['object', 'null'] } } },
      handler: (a) => {
        const r = object(a, 'channels', ['toast', 'note'])
        const services = d.registry.summaries()
        const channels: ReminderChannels = { ...d.settings.channels() }
        for (const kind of ['toast', 'note'] as const) {
          if (r[kind] === null) delete channels[kind]
          else if (r[kind] !== undefined) Object.assign(channels, { [kind]: channel(r[kind], kind, services) })
        }
        d.settings.setChannels(channels)
        if (r.toast !== undefined || r.note !== undefined) d.bus.emit('nox', 'info', `reminder channels: ${Object.keys(channels).join(', ') || 'screen only'}`)
        return JSON.stringify({ channels })
      },
    },
  ]
}
