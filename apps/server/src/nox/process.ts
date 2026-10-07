import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { PERSONA } from './persona.js'

export type NoxEvent = { type: 'text'; text: string } | { type: 'tool'; name: string } | { type: 'command'; command: string } | { type: 'done' } | { type: 'error'; message: string }

interface StreamLine {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  message?: { content?: { type?: string; name?: string; input?: { command?: unknown } }[] }
  event?: { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string; name?: string } }
}

// One stream-json line from Claude Code, as the events a listener cares about. `done` ends a turn.
export function interpret(line: string): NoxEvent | undefined {
  let msg: StreamLine
  try {
    msg = JSON.parse(line) as StreamLine
  } catch {
    return undefined
  }
  if (msg.type === 'stream_event') {
    const e = msg.event
    if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) return { type: 'text', text: e.delta.text }
    if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use' && e.content_block.name) return { type: 'tool', name: e.content_block.name.replace(/^mcp__meridian__/, '') }
  }
  // The complete call, which is the first place the command it runs is known.
  if (msg.type === 'assistant') {
    const call = msg.message?.content?.find((b) => b.type === 'tool_use' && b.name === 'Bash')
    if (typeof call?.input?.command === 'string') return { type: 'command', command: call.input.command }
  }
  if (msg.type === 'result') return msg.is_error ? { type: 'error', message: msg.result ?? 'the model returned an error' } : { type: 'done' }
  return undefined
}

export interface NoxConfig {
  home: string
  model: string
  mcpUrl: string
  gateUrl: string
  // Owner's notes appended to the persona.
  notes: string
  // Replaces the persona (background tasks are not the voice), and tools it may not use at all.
  persona?: string
  deny?: string[]
  sessionId: string
  resume: boolean
}

// Machines NOX may reach over SSH, with the owner's existing config and keys.
export const SSH_HOSTS = ['mac-lan', 'win-lan']

// Told to the auto mode classifier, which decides every Bash call: reading on the hosts goes through,
// changing them is blocked unless the owner asked for it in this conversation.
const AUTO_MODE_ENVIRONMENT = [
  `NOX is the owner's voice assistant on a homelab server. Its only Bash use is \`ssh <host> <command>\` to the owner's machines: ${SSH_HOSTS.join(', ')}. These are trusted. Reading state on them (status, logs, disk, processes, listings) is expected.`,
  'Anything else in Bash (local files, other hosts, the network, credentials or keys) is out of scope.',
]

// What NOX is allowed to be. The only built-in tool is Bash, and every call goes through the auto mode
// classifier; anything else is off, so Bash and the Meridian MCP server are the whole of its reach.
// This is the guard-rail, and it is tested.
export function buildArgs(c: NoxConfig): string[] {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--model', c.model,
    '--system-prompt', c.notes ? `${c.persona ?? PERSONA}\n\nOwner's notes\n${c.notes}` : (c.persona ?? PERSONA),
    '--tools', 'Bash',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--strict-mcp-config',
    '--mcp-config', JSON.stringify({ mcpServers: { meridian: { type: 'http', url: c.mcpUrl }, gate: { type: 'http', url: c.gateUrl } } }),
    '--allowedTools', 'mcp__meridian',
    ...(c.deny?.length ? ['--disallowedTools', ...c.deny] : []),
    '--permission-mode', 'auto',
    '--permission-prompt-tool', 'mcp__gate__approve',
    '--settings', JSON.stringify({ autoMode: { environment: AUTO_MODE_ENVIRONMENT } }),
    ...(c.resume ? ['--resume', c.sessionId] : ['--session-id', c.sessionId]),
  ]
}

// Where NOX lives: its notes, and the working directory of its processes.
export const noxHome = (override?: string): string => override ?? process.env.NOX_HOME ?? join(homedir(), '.meridian', 'nox')

// The owner's notes for NOX: machines, house rules. Empty when there are none.
export function readNotes(home: string): string {
  try {
    return readFileSync(join(home, 'CLAUDE.md'), 'utf8').trim()
  } catch {
    return ''
  }
}

const TURN_TIMEOUT_MS = 120_000

interface Hooks {
  // Called with the workspace a turn is for, so tools default to it.
  setWorkspace: (id: string) => void
  log: (message: string) => void
}

// The single global NOX session: one long-lived headless Claude Code process (starting one costs
// seconds, a turn on a warm one about a second), resumed across restarts, answering one request at a time.
export class Nox {
  private child: ChildProcessWithoutNullStreams | undefined
  private listener: ((event: NoxEvent) => void) | undefined
  private tail: Promise<unknown> = Promise.resolve()
  // Set while an interrupted turn winds down: Claude Code reports it as an error, which is not one.
  private interrupted = false

  constructor(
    private options: { home?: string; model?: string; port: number },
    private hooks: Hooks,
  ) {}

  private get home(): string {
    return noxHome(this.options.home)
  }

  private config(): NoxConfig {
    mkdirSync(this.home, { recursive: true })
    const sessionFile = join(this.home, 'session-id')
    let sessionId: string | undefined
    try {
      sessionId = readFileSync(sessionFile, 'utf8').trim() || undefined
    } catch {
      // First start: no session yet.
    }
    const resume = sessionId !== undefined
    sessionId ??= randomUUID()
    if (!resume) writeFileSync(sessionFile, sessionId)
    const notes = readNotes(this.home)
    return { home: this.home, model: this.options.model ?? process.env.NOX_MODEL ?? 'sonnet', mcpUrl: `http://127.0.0.1:${this.options.port}/mcp`, gateUrl: `http://127.0.0.1:${this.options.port}/mcp/gate`, notes, sessionId, resume }
  }

  private spawnProcess(): ChildProcessWithoutNullStreams {
    const config = this.config()
    const child = spawn('claude', buildArgs(config), { cwd: config.home, stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    createInterface({ input: child.stdout }).on('line', (line) => {
      const event = interpret(line)
      if (event) this.listener?.(event)
    })
    child.on('close', (code) => {
      this.hooks.log(`NOX process exited (${code})`)
      if (this.child === child) this.child = undefined
      // A session that can't be resumed (deleted history) starts over next time.
      if (config.resume && /No conversation found/i.test(stderr)) rmSync(join(config.home, 'session-id'), { force: true })
      this.listener?.({ type: 'error', message: stderr.trim().split('\n').at(-1) || `the NOX process exited (${code})` })
    })
    return child
  }

  // Answers one request, streaming what NOX says. Requests are served one at a time.
  async *say(text: string, workspace: string): AsyncGenerator<NoxEvent> {
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => (release = resolve))
    await previous
    try {
      this.hooks.setWorkspace(workspace)
      const child = (this.child ??= this.spawnProcess())

      const pending: NoxEvent[] = []
      let wake: (() => void) | undefined
      this.interrupted = false
      this.listener = (event) => {
        pending.push(this.interrupted && event.type === 'error' ? { type: 'done' } : event)
        wake?.()
      }
      const timer = setTimeout(() => {
        this.listener?.({ type: 'error', message: 'NOX took too long to answer' })
        child.kill()
      }, TURN_TIMEOUT_MS)

      child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`)

      try {
        for (;;) {
          while (pending.length === 0) await new Promise<void>((resolve) => (wake = resolve))
          const event = pending.shift()!
          yield event
          if (event.type === 'done' || event.type === 'error') return
        }
      } finally {
        clearTimeout(timer)
        this.listener = undefined
      }
    } finally {
      release()
    }
  }

  // Cuts the turn that is running short, without restarting the process. Nothing happens between turns.
  interrupt(): void {
    if (!this.child || !this.listener) return
    this.interrupted = true
    this.child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } })}\n`)
  }

  stop(): void {
    this.child?.kill()
  }
}

// What goes to the event log when NOX runs a shell command, whoever's turn it is.
export const commandNote = (command: string): string => `ran: ${command.length > 200 ? `${command.slice(0, 200)}…` : command}`
