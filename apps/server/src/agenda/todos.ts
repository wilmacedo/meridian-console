import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

// The owner's tasks and reminders: one thing to do, with an optional moment to be reminded of it. A reminder is
// only ever set by the owner; the server's part is to deliver it at that moment.
export interface Todo {
  id: string
  title: string
  notes?: string
  status: 'open' | 'done' | 'dropped'
  dueAt?: number
  // The next moment to remind the owner; none means it waits in the list for a review.
  remindAt?: number
  // An RRULE (see recurrence.ts) and its first occurrence, which sets the time of day and the phase.
  recurrence?: string
  anchorAt?: number
  // How many times the owner put it off: the cue for NOX to help instead of just postponing again.
  postponed: number
  firedAt?: number
  // The one repeat of a reminder nobody answered.
  repeatAt?: number
  source?: string
  createdAt: number
  updatedAt: number
  doneAt?: number
}

export type TodoEvent = 'created' | 'fired' | 'repeated' | 'snoozed' | 'done' | 'dropped' | 'edited' | 'reopened'

const COLUMNS: Record<keyof Todo, string> = {
  id: 'id',
  title: 'title',
  notes: 'notes',
  status: 'status',
  dueAt: 'due_at',
  remindAt: 'remind_at',
  recurrence: 'recurrence',
  anchorAt: 'anchor_at',
  postponed: 'postponed',
  firedAt: 'fired_at',
  repeatAt: 'repeat_at',
  source: 'source',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  doneAt: 'done_at',
}

const todoOf = (row: Record<string, unknown>): Todo =>
  Object.fromEntries(Object.entries(COLUMNS).flatMap(([key, column]) => (row[column] === null || row[column] === undefined ? [] : [[key, row[column]]]))) as unknown as Todo

export class TodoStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      due_at INTEGER,
      remind_at INTEGER,
      recurrence TEXT,
      anchor_at INTEGER,
      postponed INTEGER NOT NULL DEFAULT 0,
      fired_at INTEGER,
      repeat_at INTEGER,
      source TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      done_at INTEGER
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS todo_log (
      todo_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      what TEXT NOT NULL,
      detail TEXT
    )`)
    db.exec('CREATE INDEX IF NOT EXISTS todo_log_by_todo ON todo_log (todo_id, at)')
  }

  // Short ids, so a log line or a spoken correction can carry one.
  private newId(): string {
    for (;;) {
      const id = `t-${randomBytes(2).toString('hex')}`
      if (!this.get(id)) return id
    }
  }

  add(fields: Omit<Todo, 'id' | 'status' | 'postponed' | 'createdAt' | 'updatedAt'>, now: number): Todo {
    const todo: Todo = { ...fields, id: this.newId(), status: 'open', postponed: 0, createdAt: now, updatedAt: now }
    const keys = Object.keys(todo) as (keyof Todo)[]
    this.db.prepare(`INSERT INTO todos (${keys.map((k) => COLUMNS[k]).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => todo[k] as string | number))
    this.log(todo.id, 'created', undefined, now)
    return todo
  }

  get(id: string): Todo | undefined {
    const row = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row && todoOf(row)
  }

  // `null` clears a field.
  update(id: string, changes: { [K in keyof Todo]?: Todo[K] | null }, now: number): Todo {
    const keys = (Object.keys(changes) as (keyof Todo)[]).filter((k) => k !== 'id' && changes[k] !== undefined)
    this.db
      .prepare(`UPDATE todos SET ${[...keys.map((k) => `${COLUMNS[k]} = ?`), 'updated_at = ?'].join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => changes[k] as string | number | null), now, id)
    return this.get(id)!
  }

  list(status: Todo['status'] | 'all' = 'open'): Todo[] {
    const rows = (status === 'all' ? this.db.prepare('SELECT * FROM todos ORDER BY created_at').all() : this.db.prepare('SELECT * FROM todos WHERE status = ? ORDER BY created_at').all(status)) as Record<string, unknown>[]
    return rows.map(todoOf)
  }

  // Open reminders whose moment has come, and repeats that are due.
  due(now: number): { fire: Todo[]; repeat: Todo[] } {
    const open = (where: string) => (this.db.prepare(`SELECT * FROM todos WHERE status = 'open' AND ${where} <= ? ORDER BY ${where}`).all(now) as Record<string, unknown>[]).map(todoOf)
    return { fire: open('remind_at'), repeat: open('repeat_at') }
  }

  log(id: string, what: TodoEvent, detail: string | undefined, at: number): void {
    this.db.prepare('INSERT INTO todo_log (todo_id, at, what, detail) VALUES (?, ?, ?, ?)').run(id, at, what, detail ?? null)
  }

  history(id: string): { at: number; what: TodoEvent; detail?: string }[] {
    return (this.db.prepare('SELECT at, what, detail FROM todo_log WHERE todo_id = ? ORDER BY at').all(id) as { at: number; what: TodoEvent; detail: string | null }[]).map((r) => ({ at: r.at, what: r.what, ...(r.detail ? { detail: r.detail } : {}) }))
  }

  // What was finished in a period, for a review.
  doneBetween(from: number, to: number): Todo[] {
    return (this.db.prepare("SELECT * FROM todos WHERE status = 'done' AND done_at >= ? AND done_at < ? ORDER BY done_at").all(from, to) as Record<string, unknown>[]).map(todoOf)
  }
}

// Settings of the reminders that are the owner's to change, by voice: how a reminder reaches them besides the
// screen. Kept as data so the core names no service.
export interface ReminderChannels {
  // A service action that shows a notification, with "{title}" and "{text}" filled in its input.
  toast?: { service: string; action: string; input: Record<string, unknown> }
  // A service action that sends the owner a note, given { text }.
  note?: { service: string; action: string }
}

export class AgendaSettings {
  constructor(private db: DatabaseSync) {
    db.exec('CREATE TABLE IF NOT EXISTS agenda_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }

  channels(): ReminderChannels {
    const row = this.db.prepare("SELECT value FROM agenda_settings WHERE key = 'channels'").get() as { value: string } | undefined
    return row ? (JSON.parse(row.value) as ReminderChannels) : {}
  }

  setChannels(channels: ReminderChannels): void {
    this.db.prepare("INSERT INTO agenda_settings (key, value) VALUES ('channels', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(channels))
  }
}
