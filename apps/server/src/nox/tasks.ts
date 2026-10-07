import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type { DocSpec } from '@meridian/service-sdk'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import { buildArgs, commandNote, interpret, machineFacts, readNotes, SSH_HOSTS, type NoxConfig } from './process.js'

const MAX_RUNNING = 2
const TASK_TIMEOUT_MS = 15 * 60_000
const FINAL_WORDS = 200

export interface Task {
  id: string
  title: string
  workspace: string
  // The tab that asked for it, where its document appears.
  screen?: string
  state: 'running' | 'done' | 'failed' | 'stopped'
}

// The part of a child process a task uses; tests stand in for it.
export interface TaskProcess {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill: () => void
  onClose: (listener: (code: number | null) => void) => void
}

export type SpawnTask = (args: string[], cwd: string) => TaskProcess

const spawnClaude: SpawnTask = (args, cwd) => {
  const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  return { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, kill: () => child.kill(), onClose: (l) => child.on('close', l) }
}

export const docIdOf = (task: Pick<Task, 'id'>): string => `task-${task.id}`

const taskPersona = (task: Task): string => `You are a background worker for NOX, the voice of a homelab control console called Meridian. The owner asked NOX for one job and NOX handed it to you so the conversation stays free. Nobody talks to you while you work: do the job, do not ask questions.

Reporting
- Show progress in a live document: call compose_doc with id "${docIdOf(task)}" and workspace "${task.workspace}", with the same title ("${task.title}"). Compose it as soon as you start, then again each time something changes: a progress block, a list of steps with states (done, active, todo) and the findings so far. Composing again with the same id updates the document in place. Keep it short and factual.
- When you finish, update the document one last time with the outcome (a callout, tone ok if it worked, bad if it did not). Your last message is one plain sentence saying how it went.

What you can do
- The Meridian tools to read status, telemetry, events and services, and compose_doc. Do not open, close or arrange windows, and do not start tasks.
- This machine is yours and the first place to work: Bash and the file tools (Read, Glob, Grep, Edit, Write) find files, read logs, check Docker and run commands here, without asking. Use ssh only when the job names the Mac or Windows machine: \`ssh -o BatchMode=yes -o ConnectTimeout=5 <host> <command>\` to ${SSH_HOSTS.join(' or ')}. Anything that changes something asks the owner to confirm on the screen; if they decline, say so in the document and stop that step. Never put secrets (.env, keys, tokens, passwords) in the document.
- Never invent state. If something fails, report it plainly in the document.`

const doc = (task: Task, blocks: DocSpec['blocks']): DocSpec => ({ id: docIdOf(task), title: task.title, kicker: `BACKGROUND TASK · ${task.id}`, blocks })

// Long jobs that run beside the conversation: each is its own headless Claude Code process with the
// same guard-rails as NOX, reporting into a live document and logging to the event stream. They use the
// owner's Claude subscription like any turn does, so only a couple run at once.
export class Tasks {
  private running_ = new Map<string, { task: Task; process: TaskProcess; timer: ReturnType<typeof setTimeout> }>()
  private all: Task[] = []
  private listeners = new Set<() => void>()

  constructor(
    private options: { port: number; home: string; model: string; bus: EventBus; screens: ScreenRegistry; spawn?: SpawnTask },
  ) {}

  list(): Task[] {
    return [...this.all]
  }

  // What a screen shows: the tasks still running for its workspace.
  running(workspace: string): { id: string; title: string }[] {
    return [...this.running_.values()].filter((e) => e.task.workspace === workspace).map((e) => ({ id: e.task.id, title: e.task.title }))
  }

  // Told whenever a task starts or ends.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(workspace: string, title: string, goal: string, screen?: string): Task {
    if (this.running_.size >= MAX_RUNNING) throw new Error(`${MAX_RUNNING} tasks are already running; wait for one to finish or stop one`)
    const task: Task = { id: randomUUID().slice(0, 8), title: title.slice(0, 80), workspace, screen, state: 'running' }
    this.all.push(task)

    const { port, home, model, bus, screens } = this.options
    const config: NoxConfig = {
      home,
      model,
      mcpUrl: `http://127.0.0.1:${port}/mcp`,
      gateUrl: `http://127.0.0.1:${port}/mcp/gate/${encodeURIComponent(workspace)}`,
      notes: readNotes(home),
      facts: machineFacts(home),
      persona: taskPersona(task),
      deny: ['mcp__meridian__start_task'],
      sessionId: randomUUID(),
      resume: false,
    }
    const process = (this.options.spawn ?? spawnClaude)(buildArgs(config), home)
    const timer = setTimeout(() => this.finish(task, 'failed', 'took too long'), TASK_TIMEOUT_MS)
    // Writing to a process that already ended must not take the server down.
    process.stdin.on('error', () => undefined)
    this.running_.set(task.id, { task, process, timer })
    this.changed()
    bus.emit('nox', 'info', `task ${task.id} started: ${task.title}`)
    screens.dispatch(workspace, { name: 'compose_doc', doc: doc(task, [{ t: 'callout', tone: 'accent', title: 'STARTING', text: goal.slice(0, 400) }]) }, screen)

    let said = ''
    createInterface({ input: process.stdout }).on('line', (line) => {
      const event = interpret(line)
      if (event?.type === 'command') bus.emit('nox', 'info', `task ${task.id} ${commandNote(event.command)}`)
      else if (event?.type === 'text') said = (said + event.text).slice(-FINAL_WORDS)
      else if (event?.type === 'done') this.finish(task, 'done', said.trim())
      else if (event?.type === 'error') this.finish(task, 'failed', event.message)
    })
    process.onClose((code) => this.finish(task, 'failed', `the process exited (${code})`))
    process.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: `${task.title}\n\n${goal}` } })}\n`)
    return task
  }

  stop(id: string): boolean {
    const entry = this.running_.get(id)
    if (!entry) return false
    this.finish(entry.task, 'stopped', 'stopped by the owner')
    return true
  }

  stopAll(): void {
    for (const id of [...this.running_.keys()]) this.stop(id)
  }

  private changed(): void {
    for (const listener of this.listeners) listener()
  }

  // Ends a task once; whichever of done, error, exit, timeout or stop comes first wins.
  private finish(task: Task, state: Task['state'], note: string): void {
    const entry = this.running_.get(task.id)
    if (!entry) return
    this.running_.delete(task.id)
    this.changed()
    clearTimeout(entry.timer)
    entry.process.stdin.end()
    entry.process.kill()
    task.state = state
    const { bus, screens } = this.options
    bus.emit('nox', state === 'done' ? 'info' : 'warn', `task ${task.id} ${state}${note ? `: ${note}` : ''}`)
    // A task that ended well wrote its own outcome; one that didn't can't be trusted to have.
    if (state !== 'done') {
      screens.dispatch(task.workspace, { name: 'compose_doc', doc: doc(task, [{ t: 'callout', tone: state === 'stopped' ? 'warn' : 'bad', title: state.toUpperCase(), text: note || 'The task ended without a result.' }]) }, task.screen)
    }
  }
}
