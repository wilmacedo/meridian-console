import type { DatabaseSync } from 'node:sqlite'
import type { ServiceSummary, TaskStep } from '@meridian/service-sdk'
import { ID_PATTERN } from '../managed-services.js'
import { fail, list, object, text } from './fields.js'
import { normalize } from './match.js'
import { validateStep, type Step } from './steps.js'

// A routine is the owner's: a phrase they say and the steps NOX then runs. Nothing runs one but the owner
// saying its phrase or asking for it by name.

// Triggers are a list of kinds so a new way to start a routine is a new kind, not a new column. The phrase is
// the only kind there is.
export interface PhraseTrigger {
  kind: 'phrase'
  phrases: string[]
  // Local "HH:MM"; outside it NOX asks before running. Ends before it starts to run across midnight.
  window?: { from: string; to: string }
}

export type Trigger = PhraseTrigger

export interface Routine {
  id: string
  name: string
  triggers: Trigger[]
  steps: Step[]
  // Of this shape; a routine saved in an older one is brought up to date when it is read.
  version: number
}

export const ROUTINE_VERSION = 1
const MAX_TRIGGERS = 4
const MAX_PHRASES = 6
const MAX_STEPS = 8
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function validateTrigger(raw: unknown, path: string): Trigger {
  if ((raw as { kind?: unknown } | null)?.kind !== 'phrase') fail(`${path}.kind must be "phrase", the only kind of trigger`)
  const r = object(raw, path, ['kind', 'phrases', 'window'])
  const phrases = list(r, 'phrases', path, 1, MAX_PHRASES).map((p, i) => {
    if (typeof p !== 'string' || !normalize(p)) return fail(`${path}.phrases[${i}] must be a phrase`)
    if (p.length > 60) fail(`${path}.phrases[${i}] is longer than 60 characters`)
    return p.trim()
  })
  if (r.window === undefined) return { kind: 'phrase', phrases }
  const w = object(r.window, `${path}.window`, ['from', 'to'])
  const from = text(w, 'from', `${path}.window`, 5)
  const to = text(w, 'to', `${path}.window`, 5)
  if (!CLOCK.test(from) || !CLOCK.test(to)) fail(`${path}.window: from and to are local times like "05:00"`)
  if (from === to) fail(`${path}.window: from and to must differ`)
  return { kind: 'phrase', phrases, window: { from, to } }
}

// Checks a whole routine as NOX sends it. `others` are the saved routines, so a phrase cannot start two; `profiles`
// are the Claude Code profiles a step may read with.
export function validateRoutine(raw: unknown, services: ServiceSummary[], others: Routine[], profiles: string[] = []): Routine {
  const r = object(raw, 'routine', ['id', 'name', 'triggers', 'steps', 'version'])
  const id = text(r, 'id', 'routine', 40)
  if (!ID_PATTERN.test(id)) fail('routine.id must be kebab-case, for example "bom-dia"')
  const triggers = list(r, 'triggers', 'routine', 1, MAX_TRIGGERS).map((t, i) => validateTrigger(t, `routine.triggers[${i}]`))
  const steps = list(r, 'steps', 'routine', 1, MAX_STEPS).map((s, i) => validateStep(s, `routine.steps[${i}]`, services, profiles))
  const ids = steps.map((s) => s.id)
  const repeated = ids.find((s, i) => ids.indexOf(s) !== i)
  if (repeated) fail(`routine.steps: the id "${repeated}" is used twice`)

  const taken = new Map(others.filter((o) => o.id !== id).flatMap((o) => o.triggers.flatMap((t) => t.phrases.map((p) => [normalize(p), o] as const))))
  for (const phrase of triggers.flatMap((t) => t.phrases)) {
    const owner = taken.get(normalize(phrase))
    if (owner) fail(`the phrase "${phrase}" already starts the routine "${owner.name}" (${owner.id})`)
  }
  return { id, name: text(r, 'name', 'routine', 40), triggers, steps, version: ROUTINE_VERSION }
}

export type RunState = 'running' | 'done' | 'failed' | 'stopped' | 'interrupted'

export interface RoutineRun {
  // The id of the worker task that ran it; its briefing is the document task-<id>.
  id: string
  routineId: string
  trigger: { kind: 'phrase'; heard?: string } | { kind: 'by_name' }
  startedAt: number
  finishedAt?: number
  state: RunState
  // The worker's own steps as it last reported them.
  steps: TaskStep[]
}

interface RunRow {
  id: string
  routine_id: string
  trigger: string
  started_at: number
  finished_at: number | null
  state: RunState
  steps: string
}

const runOf = (r: RunRow): RoutineRun => ({
  id: r.id,
  routineId: r.routine_id,
  trigger: JSON.parse(r.trigger) as RoutineRun['trigger'],
  startedAt: r.started_at,
  ...(r.finished_at === null ? {} : { finishedAt: r.finished_at }),
  state: r.state,
  steps: JSON.parse(r.steps) as TaskStep[],
})

export class RoutineStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      spec TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      state TEXT NOT NULL,
      steps TEXT NOT NULL
    )`)
    db.exec('CREATE INDEX IF NOT EXISTS routine_runs_by_routine ON routine_runs (routine_id, started_at)')
  }

  list(): Routine[] {
    return (this.db.prepare('SELECT spec FROM routines ORDER BY created_at').all() as { spec: string }[]).map((r) => JSON.parse(r.spec) as Routine)
  }

  get(id: string): Routine | undefined {
    const row = this.db.prepare('SELECT spec FROM routines WHERE id = ?').get(id) as { spec: string } | undefined
    return row && (JSON.parse(row.spec) as Routine)
  }

  put(routine: Routine): void {
    const now = new Date().toISOString()
    this.db
      .prepare('INSERT INTO routines (id, spec, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET spec = excluded.spec, updated_at = excluded.updated_at')
      .run(routine.id, JSON.stringify(routine), now, now)
  }

  delete(id: string): boolean {
    this.db.prepare('DELETE FROM routine_runs WHERE routine_id = ?').run(id)
    return Number(this.db.prepare('DELETE FROM routines WHERE id = ?').run(id).changes) > 0
  }

  startRun(run: Pick<RoutineRun, 'id' | 'routineId' | 'trigger' | 'startedAt'>): void {
    this.db
      .prepare("INSERT INTO routine_runs (id, routine_id, trigger, started_at, state, steps) VALUES (?, ?, ?, ?, 'running', '[]')")
      .run(run.id, run.routineId, JSON.stringify(run.trigger), run.startedAt)
  }

  finishRun(id: string, state: Exclude<RunState, 'running'>, steps: TaskStep[], at: number): void {
    this.db.prepare('UPDATE routine_runs SET state = ?, steps = ?, finished_at = ? WHERE id = ?').run(state, JSON.stringify(steps), at, id)
  }

  // A worker does not survive a restart, so a run the server was watching when it went down never ends.
  interruptRunning(at: number): void {
    this.db.prepare("UPDATE routine_runs SET state = 'interrupted', finished_at = ? WHERE state = 'running'").run(at)
  }

  runs(routineId: string, limit: number): RoutineRun[] {
    return (this.db.prepare('SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT ?').all(routineId, limit) as unknown as RunRow[]).map(runOf)
  }

  // The latest run that counts as having happened: one that is running or got to the end.
  lastRun(routineId: string): RoutineRun | undefined {
    const row = this.db.prepare("SELECT * FROM routine_runs WHERE routine_id = ? AND state IN ('running', 'done') ORDER BY started_at DESC LIMIT 1").get(routineId) as RunRow | undefined
    return row && runOf(row)
  }
}
