import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface AnywhProfile {
  id: string
  label: string
  host: string
  port: number
}

export interface AnywhSession {
  id: string
  title: string
  lastActiveAt: number
}

export interface AnywhApi {
  profiles(): Promise<AnywhProfile[]>
  sessions(profile: string): Promise<AnywhSession[]>
  read(profile: string, session: string, turns: number): Promise<string>
  // Without a session id a new conversation is started.
  send(profile: string, text: string, opts?: { session?: string; cwd?: string }): Promise<AnywhSent>
}

// What the agent said when its turn ended: the last thing it wrote, which is where it puts the outcome.
export interface AnywhReply {
  text: string
  stopped: boolean
  failed: boolean
}

export interface AnywhSent {
  session: string
  // Settles when the turn ends; rejects if the relay is lost or the agent takes too long (for example while it waits for input).
  reply: Promise<AnywhReply>
}

// Just the part of the relay's normalized event vocabulary that a transcript needs.
interface AgentEvent {
  type: string
  text?: string
  synthetic?: string
  parentToolUseId?: string
  name?: string
  subject?: { kind: string; command?: string; path?: string; pattern?: string; query?: string; url?: string; server?: string; tool?: string; label?: string }
}

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'anywh')
const WS_TIMEOUT_MS = 10_000
const REPLY_TIMEOUT_MS = 30 * 60_000
const MAX_TEXT_CHARS = 1500
const MAX_TRANSCRIPT_CHARS = 8000

const cut = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s)

export async function loadProfiles(configDir = DEFAULT_CONFIG_DIR): Promise<AnywhProfile[]> {
  let registry: { profiles?: { id: string; label?: string }[] }
  try {
    registry = JSON.parse(await readFile(join(configDir, 'profiles.json'), 'utf8'))
  } catch {
    return []
  }
  const profiles: AnywhProfile[] = []
  for (const p of registry.profiles ?? []) {
    let env: string
    try {
      env = await readFile(join(configDir, 'env', `${p.id}.env`), 'utf8')
    } catch {
      continue
    }
    const vars = Object.fromEntries([...env.matchAll(/^\s*([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]))
    const port = Number(vars.RELAY_PORT)
    if (!Number.isInteger(port)) continue
    profiles.push({ id: p.id, label: p.label ?? p.id, host: vars.RELAY_HOST || '127.0.0.1', port })
  }
  return profiles
}

const subjectLine = (e: AgentEvent): string => {
  const s = e.subject
  if (!s) return e.name ?? 'tool'
  switch (s.kind) {
    case 'shell': return `$ ${cut(s.command ?? '', 200)}`
    case 'read': case 'edit': case 'write': return `${s.kind} ${s.path}`
    case 'search': return `search ${cut(s.pattern ?? '', 100)}`
    case 'web': return `web ${s.query ?? s.url ?? ''}`
    case 'mcp': return `${s.server}.${s.tool}`
    default: return s.label ?? e.name ?? 'tool'
  }
}

// The last `turns` turns of a session as plain lines; older lines go first when the budget runs out.
export function formatTranscript(events: AgentEvent[], turns: number): string {
  const lines: { turn: number; text: string }[] = []
  let turn = 0
  let running = false
  for (const e of events) {
    if (e.parentToolUseId) continue
    if (e.type === 'user_message') {
      if (e.synthetic) {
        lines.push({ turn, text: `[${e.synthetic}]` })
      } else {
        turn++
        lines.push({ turn, text: `owner: ${cut(e.text ?? '', MAX_TEXT_CHARS)}` })
      }
    } else if (e.type === 'text') lines.push({ turn, text: `agent: ${cut(e.text ?? '', MAX_TEXT_CHARS)}` })
    else if (e.type === 'tool_started') lines.push({ turn, text: `  [${subjectLine(e)}]` })
    else if (e.type === 'turn_started') running = true
    else if (e.type === 'turn_ended') running = false
  }
  let kept = lines.filter((l) => l.turn > turn - turns).map((l) => l.text)
  let total = kept.reduce((n, l) => n + l.length + 1, 0)
  let dropped = false
  while (total > MAX_TRANSCRIPT_CHARS && kept.length > 1) {
    total -= kept[0].length + 1
    kept = kept.slice(1)
    dropped = true
  }
  if (kept.length === 0) return 'The conversation is empty.'
  return [...(dropped ? ['[earlier lines omitted]'] : []), ...kept, ...(running ? ['[a turn is still running]'] : [])].join('\n')
}

// One WebSocket conversation with a relay: `step` gets each message and settles the promise by returning a value.
function talk<T>(url: string, onOpen: (send: (m: unknown) => void) => void, step: (m: Record<string, unknown>, send: (m: unknown) => void) => T | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const done = (fn: () => void): void => {
      clearTimeout(timer)
      ws.close()
      fn()
    }
    const timer = setTimeout(() => done(() => reject(new Error('the anywh relay did not answer in time'))), WS_TIMEOUT_MS)
    const send = (m: unknown): void => ws.send(JSON.stringify(m))
    ws.onopen = () => onOpen(send)
    ws.onerror = () => done(() => reject(new Error('could not reach the anywh relay; it may be down')))
    ws.onmessage = (ev) => {
      try {
        const result = step(JSON.parse(String(ev.data)) as Record<string, unknown>, send)
        if (result !== undefined) done(() => resolve(result))
      } catch (err) {
        done(() => reject(err))
      }
    }
  })
}

export class Anywh implements AnywhApi {
  constructor(private configDir = DEFAULT_CONFIG_DIR) {}

  profiles(): Promise<AnywhProfile[]> {
    return loadProfiles(this.configDir)
  }

  private async profile(id: string): Promise<AnywhProfile> {
    const all = await this.profiles()
    const found = all.find((p) => p.id === id)
    if (!found) throw new Error(`no anywh profile "${id}"; anywh_list_profiles shows ${all.map((p) => p.id).join(', ') || 'none'}`)
    return found
  }

  async sessions(profile: string): Promise<AnywhSession[]> {
    const p = await this.profile(profile)
    let res: Response
    try {
      res = await fetch(`http://${p.host}:${p.port}/sessions`, { signal: AbortSignal.timeout(WS_TIMEOUT_MS) })
    } catch {
      throw new Error(`could not reach the anywh relay of "${p.id}"; it may be down`)
    }
    if (!res.ok) throw new Error(`the anywh relay of "${p.id}" answered ${res.status}`)
    const body = (await res.json()) as { sessions: AnywhSession[] }
    return body.sessions.map(({ id, title, lastActiveAt }) => ({ id, title, lastActiveAt }))
  }

  // Connecting to an unknown id would create that session on the relay, so ids are checked first.
  private async mustExist(profile: string, session: string): Promise<void> {
    if (!(await this.sessions(profile)).some((s) => s.id === session)) throw new Error(`no session "${session}" in "${profile}"; anywh_list_sessions shows the ones that exist`)
  }

  private wsUrl(p: AnywhProfile, session: string): string {
    return `ws://${p.host}:${p.port}/?session=${encodeURIComponent(session)}`
  }

  async read(profile: string, session: string, turns: number): Promise<string> {
    await this.mustExist(profile, session)
    const p = await this.profile(profile)
    const events: AgentEvent[] = []
    const turnCount = (): number => events.filter((e) => e.type === 'user_message' && !e.synthetic).length
    const pageEvents = (m: Record<string, unknown>): AgentEvent[] => (m.messages as { type: string; event: AgentEvent }[]).filter((x) => x.type === 'agent_event').map((x) => x.event)
    let cursor: number | undefined
    let hasMore = false
    // `caught_up` follows the first page; older pages are asked for until there are enough turns.
    const enough = (): string | undefined => (turnCount() >= turns || !hasMore ? formatTranscript(events, turns) : undefined)
    return talk(
      this.wsUrl(p, session),
      () => {},
      (m, send) => {
        if (m.type === 'history_page' || m.type === 'older_history') {
          events.unshift(...pageEvents(m))
          cursor = m.cursor as number
          hasMore = m.hasMore === true
          if (m.type === 'history_page') return undefined
        } else if (m.type !== 'caught_up') return undefined
        const result = enough()
        if (result === undefined) send({ type: 'load_older_history', beforeCursor: cursor })
        return result
      },
    )
  }

  async send(profile: string, text: string, opts: { session?: string; cwd?: string } = {}): Promise<AnywhSent> {
    const p = await this.profile(profile)
    if (opts.session) await this.mustExist(profile, opts.session)
    const session = opts.session ?? randomUUID()

    const ws = new WebSocket(this.wsUrl(p, session))
    let settleStarted!: { ok: () => void; fail: (e: Error) => void }
    let settleReply!: { ok: (r: AnywhReply) => void; fail: (e: Error) => void }
    const started = new Promise<void>((ok, fail) => (settleStarted = { ok, fail }))
    const reply = new Promise<AnywhReply>((ok, fail) => (settleReply = { ok, fail }))
    // Nobody may be waiting on the reply (the message was sent, that is all that was asked).
    reply.catch(() => undefined)
    const fail = (e: Error): void => {
      settleStarted.fail(e)
      settleReply.fail(e)
    }
    const startTimer = setTimeout(() => fail(new Error('the anywh relay did not answer in time')), WS_TIMEOUT_MS)
    const replyTimer = setTimeout(() => fail(new Error('the agent did not finish in time; it may be waiting for input in anywh')), REPLY_TIMEOUT_MS)
    const cleanup = (): void => {
      clearTimeout(startTimer)
      clearTimeout(replyTimer)
      ws.close()
    }
    void started.then(() => clearTimeout(startTimer), () => undefined)
    void reply.then(cleanup, cleanup)

    let caughtUp = false
    let begun = false
    let lastText = ''
    let lastError = ''
    ws.onerror = () => fail(new Error('could not reach the anywh relay; it may be down'))
    ws.onclose = () => fail(new Error('the connection to the anywh relay was lost'))
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as Record<string, unknown>
      if (m.type === 'caught_up' && !caughtUp) {
        caughtUp = true
        if (opts.cwd) ws.send(JSON.stringify({ type: 'set_cwd', path: opts.cwd }))
        ws.send(JSON.stringify({ type: 'user_message', text }))
      } else if (m.type === 'set_cwd_error') {
        fail(new Error(`the relay refused the working directory "${opts.cwd}" (${String(m.code)})`))
      } else if (caughtUp && m.type === 'agent_event') {
        const e = m.event as AgentEvent & { stopped?: boolean; message?: string }
        if (e.parentToolUseId) return
        // A turn that was already running when the message arrived ends before ours begins.
        if (e.type === 'turn_started') {
          begun = true
          lastText = ''
          settleStarted.ok()
        } else if (!begun) return
        else if (e.type === 'text') lastText = e.text ?? ''
        else if (e.type === 'error') lastError = e.message ?? ''
        else if (e.type === 'turn_ended') settleReply.ok({ text: lastText || lastError, stopped: e.stopped === true, failed: !lastText && lastError !== '' })
      }
    }

    try {
      await started
    } catch (err) {
      cleanup()
      throw err
    }
    return { session, reply }
  }
}
