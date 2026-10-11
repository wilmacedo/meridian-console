import type { DocSpec } from '@meridian/service-sdk'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import type { McpTool } from '../nox/mcp.js'
import { fail } from './fields.js'
import { phraseVerdict } from './match.js'
import { validateRoutine, type Routine, type RoutineStore } from './routines.js'
import type { RoutineRunner } from './runner.js'

interface RoutineToolDeps {
  store: RoutineStore
  // The ids of the owner's Claude Code profiles, which a step may read with.
  profiles: () => Promise<string[]>
  runner: Pick<RoutineRunner, 'run'>
  registry: Pick<Registry, 'summaries'>
  screens: Pick<ScreenRegistry, 'dispatch'>
  bus: EventBus
  currentWorkspace: () => string
  currentScreen: () => string | undefined
  now?: () => Date
}

const RECENT_RUNS = 3

const routineSchema = {
  type: 'object',
  description: 'The whole routine. Saving replaces the routine with the same id.',
  required: ['id', 'name', 'triggers', 'steps'],
  properties: {
    id: { type: 'string', description: 'Kebab-case, for example "bom-dia".' },
    name: { type: 'string', description: 'How the owner calls it, for example "Bom dia".' },
    triggers: {
      type: 'array',
      description: 'How it starts. The only kind is "phrase".',
      items: {
        type: 'object',
        required: ['kind', 'phrases'],
        properties: {
          kind: { type: 'string', enum: ['phrase'] },
          phrases: { type: 'array', items: { type: 'string' }, description: "The owner's phrase and a few close variations, 1 to 6." },
          window: { type: 'object', description: 'Only when the owner gave one: local times "HH:MM". Outside it you ask before running.', properties: { from: { type: 'string' }, to: { type: 'string' } } },
        },
      },
    },
    steps: {
      type: 'array',
      description: '1 to 8 steps, run in order.',
      items: {
        type: 'object',
        required: ['id', 'kind', 'title'],
        properties: {
          id: { type: 'string', description: 'Kebab-case, unique in the routine.' },
          kind: { type: 'string', enum: ['action', 'prompt', 'todos'], description: 'action: a read-only service action the server runs as it is (service, action, input). prompt: an instruction in the owner\'s words that a worker carries out with your tools. todos: the owner\'s own tasks and reminders (late, today, most put off).' },
          title: { type: 'string', description: 'Short label, in Portuguese, shown on the task card.' },
          service: { type: 'string' },
          action: { type: 'string' },
          input: { type: 'object', description: 'Strings may use {today}, {yesterday} and {last_run}.' },
          prompt: { type: 'string', description: 'May use {today}, {yesterday} and {last_run} (when this routine last ran).' },
          profile: { type: 'string', description: 'For a prompt step that reads mail, Slack or files: the Claude Code profile whose accounts it reads (list_profile_connectors). It only reads.' },
        },
      },
    },
  },
}

// How a routine looks on the screen, as a draft for the owner to check or once it is saved.
export function routineDoc(r: Routine, saved: boolean): DocSpec {
  const phrases = r.triggers.flatMap((t) => t.phrases)
  const windows = r.triggers.flatMap((t) => (t.window ? [`${t.window.from}–${t.window.to}`] : []))
  return {
    id: `routine-${r.id}`,
    title: r.name,
    kicker: saved ? 'ROTINA · SALVA' : 'ROTINA · RASCUNHO',
    blocks: [
      { t: 'h', level: 2, text: 'Frases de ativação' },
      { t: 'tags', items: phrases.map((label) => ({ label })) },
      ...(windows.length ? [{ t: 'kv' as const, items: [{ k: 'Horário', v: windows.join(', ') }] }] : []),
      { t: 'h', level: 2, text: 'Passos' },
      { t: 'list', items: r.steps.map((s) => ({ text: s.title, meta: s.kind === 'action' ? `${s.service} · ${s.action}` : s.kind === 'todos' ? 'LEMBRETES' : s.profile ? `PERFIL ${s.profile.toUpperCase()}` : 'NOX', state: 'todo' as const })) },
    ],
  }
}

export function routineTools(d: RoutineToolDeps): McpTool[] {
  const now = d.now ?? (() => new Date())
  const validate = async (raw: unknown): Promise<Routine> => validateRoutine(raw, d.registry.summaries(), d.store.list(), await d.profiles())
  const show = (r: Routine, saved: boolean): boolean => d.screens.dispatch(d.currentWorkspace(), { name: 'compose_doc', doc: routineDoc(r, saved) }, d.currentScreen())
  const find = (id: unknown): Routine => d.store.get(String(id)) ?? fail(`no routine "${String(id)}"; list_routines shows them`)

  return [
    {
      name: 'list_routines',
      description: "The owner's routines in full (phrases, window, steps) with their last runs. Read it before changing one, or when what the owner said may be a routine's phrase or name.",
      inputSchema: { type: 'object', properties: {} },
      handler: () => {
        const routines = d.store.list()
        if (!routines.length) return 'The owner has no routines yet.'
        return JSON.stringify(routines.map((r) => ({ ...r, recentRuns: d.store.runs(r.id, RECENT_RUNS).map(({ startedAt, state }) => ({ startedAt: new Date(startedAt).toISOString(), state })) })))
      },
    },
    {
      name: 'preview_routine',
      description: 'Checks a routine you wrote and shows it on the screen as a draft. Nothing is saved. Call it before save_routine, every time, and then ask the owner whether to save.',
      inputSchema: { type: 'object', required: ['routine'], properties: { routine: routineSchema } },
      handler: async (a) => {
        const routine = await validate(a.routine)
        const shown = show(routine, false)
        return `${shown ? 'Shown on the screen as a draft.' : 'No screen is showing this workspace, so describe it in a sentence.'} Nothing is saved yet: ask the owner, and call save_routine only once they say to save it.`
      },
    },
    {
      name: 'save_routine',
      description: 'Saves a routine the owner has just approved (after preview_routine), or replaces the one with the same id with its new version.',
      inputSchema: { type: 'object', required: ['routine'], properties: { routine: routineSchema } },
      handler: async (a) => {
        const routine = await validate(a.routine)
        const existed = d.store.get(routine.id) !== undefined
        d.store.put(routine)
        show(routine, true)
        d.bus.emit('nox', 'info', `${existed ? 'updated' : 'saved'} routine ${routine.id}`)
        return `${existed ? 'Updated' : 'Saved'} the routine "${routine.name}".`
      },
    },
    {
      name: 'delete_routine',
      description: 'Deletes a routine and its history, when the owner asks for it.',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      handler: (a) => {
        const routine = find(a.id)
        d.store.delete(routine.id)
        d.bus.emit('nox', 'info', `deleted routine ${routine.id}`)
        return `Deleted the routine "${routine.name}".`
      },
    },
    {
      name: 'run_routine',
      description:
        'Runs one of the owner\'s routines. how is "phrase" when the owner said its activation phrase (pass what they said as heard) and "by_name" when they asked for it by name. A phrase outside the routine\'s time window, or a routine that already ran today, is refused until the owner agrees: ask, and call again with confirmed true. It runs in the background, with its steps on the task card and the briefing on the screen; you are told when it ends.',
      inputSchema: {
        type: 'object',
        required: ['id', 'how'],
        properties: { id: { type: 'string' }, how: { type: 'string', enum: ['phrase', 'by_name'] }, heard: { type: 'string' }, confirmed: { type: 'boolean' } },
      },
      handler: async (a) => {
        const routine = find(a.id)
        const how = a.how === 'by_name' ? 'by_name' : 'phrase'
        if (how === 'phrase' && a.confirmed !== true) {
          const verdict = phraseVerdict(routine, d.store.lastRun(routine.id)?.startedAt, now())
          if (!verdict.go) throw new Error(`Not run: ${verdict.why}. Ask the owner whether to run it anyway, and if they agree call run_routine again with confirmed true.`)
        }
        const trigger = how === 'phrase' ? { kind: 'phrase' as const, ...(typeof a.heard === 'string' ? { heard: a.heard.slice(0, 200) } : {}) } : { kind: 'by_name' as const }
        const run = await d.runner.run(routine, trigger, d.currentWorkspace(), d.currentScreen())
        return `The routine "${routine.name}" is running (task ${run.id}): its steps are on the task card. Say so in one short sentence and do not wait; you will be told when it ends.`
      },
    },
  ]
}
