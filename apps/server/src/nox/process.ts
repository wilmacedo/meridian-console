import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AgentMode } from '@meridian/service-sdk'
import { PERSONA } from './persona.js'

export type NoxEvent = { type: 'text'; text: string } | { type: 'tool'; name: string } | { type: 'done' } | { type: 'error'; message: string }

interface StreamLine {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
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
  if (msg.type === 'result') return msg.is_error ? { type: 'error', message: msg.result ?? 'the model returned an error' } : { type: 'done' }
  return undefined
}

export interface NoxConfig {
  home: string
  model: string
  mcpUrl: string
  // Owner's notes appended to the persona.
  notes: string
  sessionId: string
  resume: boolean
}

// What NOX is allowed to be. Built-in tools are off and anything not explicitly allowed is denied, so
// the Meridian MCP server is the whole of its reach; this is the guard-rail, and it is tested.
export function buildArgs(c: NoxConfig): string[] {
  return [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--model', c.model,
    '--system-prompt', c.notes ? `${PERSONA}\n\nOwner's notes\n${c.notes}` : PERSONA,
    '--tools', '',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--strict-mcp-config',
    '--mcp-config', JSON.stringify({ mcpServers: { meridian: { type: 'http', url: c.mcpUrl } } }),
    '--allowedTools', 'mcp__meridian',
    '--permission-mode', 'dontAsk',
    ...(c.resume ? ['--resume', c.sessionId] : ['--session-id', c.sessionId]),
  ]
}

const TURN_TIMEOUT_MS = 120_000

interface Hooks {
  setMode: (mode: AgentMode) => void
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

  constructor(
    private options: { home?: string; model?: string; port: number },
    private hooks: Hooks,
  ) {}

  private get home(): string {
    return this.options.home ?? process.env.NOX_HOME ?? join(homedir(), '.meridian', 'nox')
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
    let notes = ''
    try {
      notes = readFileSync(join(this.home, 'CLAUDE.md'), 'utf8').trim()
    } catch {
      // No notes.
    }
    return { home: this.home, model: this.options.model ?? process.env.NOX_MODEL ?? 'sonnet', mcpUrl: `http://127.0.0.1:${this.options.port}/mcp`, notes, sessionId, resume }
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
      this.hooks.setMode('thinking')
      const child = (this.child ??= this.spawnProcess())

      const pending: NoxEvent[] = []
      let wake: (() => void) | undefined
      this.listener = (event) => {
        pending.push(event)
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
          if (event.type === 'text') this.hooks.setMode('speaking')
          yield event
          if (event.type === 'done' || event.type === 'error') return
        }
      } finally {
        clearTimeout(timer)
        this.listener = undefined
      }
    } finally {
      this.hooks.setMode('idle')
      release()
    }
  }

  stop(): void {
    this.child?.kill()
  }
}
