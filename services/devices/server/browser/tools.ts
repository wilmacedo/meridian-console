import { createHash } from 'node:crypto'
import type { AuditLog } from '../audit.js'
import { authorize, untrusted, type Confirm } from '../policy.js'
import { BrowserGateway, newSessionId, RpcFailure, type BrowserConnection } from './gateway.js'
import { cleanOutline, elementFacts } from './outline.js'
import * as page from './page-scripts.js'
import { classifyUrl, keyAllowed, refuseTyping, riskOfKey, riskOfTarget, type ElementFacts } from './risk.js'

// What every read costs at most. Small on purpose: the rest of the page comes only when NOX asks for it.
const READ_TOKENS = 1_500

interface Session {
  id: string
  foreground: boolean
  facts: Map<string, ElementFacts>
  lastRead?: string
  // Host and path of the page the last step left us on, for the audit log.
  at?: string
}

export interface Target {
  profile: string
  // A ref from the last read ("@e12"), or a CSS selector from find.
  ref?: string
  selector?: string
}

const hostPath = (url: string): string => {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url.slice(0, 40)
  }
}

const quote = (s: string | undefined): string => `"${(s ?? '').slice(0, 60)}"`

export class DeclinedError extends Error {}

export class BrowserTools {
  private readonly sessions = new WeakMap<BrowserConnection, Session>()

  constructor(
    private readonly gateway: BrowserGateway,
    private readonly audit: AuditLog,
    private readonly allowed: (profile: string) => string[],
  ) {}

  status(): string {
    const online = this.gateway.list()
    if (online.length === 0) return 'No browser is connected. The extension may be off, the browser closed, or the kill switch on.'
    return online
      .map((c) => `${c.profile}: ${c.hello.browser.name} ${c.hello.browser.version}, connected ${Math.round((Date.now() - c.connectedAt) / 60_000)} min, ${this.sessions.has(c) ? 'session open' : 'no session'}`)
      .join('\n')
  }

  open(profile: string, url: string, foreground: boolean): Promise<string> {
    return this.run('browser_open', profile, async (conn, s) => {
      if (classifyUrl(url, this.allowed(profile)) === 'blocked') throw new Error(`${hostPath(url)} is not allowed for "${profile}": it must be https and on the allowlist.`)
      const session = await this.session(conn, foreground)
      const nav = await conn.call('tool.navigate', { session_id: session.id, url }, 45_000)
      session.facts = new Map()
      session.lastRead = undefined
      const { url: now, title } = await this.where(conn, session)
      const state = classifyUrl(now, this.allowed(profile))
      s.at = hostPath(now)
      if (state === 'blocked') throw new Error(`The page ended on ${hostPath(now)}, which is not allowed for "${profile}". Nothing was read.`)
      if (state === 'needs_login') return `The site asks to sign in (${hostPath(now)}). Ask the owner to sign in in that browser window; you cannot and must not.`
      return `Opened ${hostPath(now)}, title ${quote(title)}${nav.reached === 'timeout' ? ' (still loading)' : ''}.`
    })
  }

  read(profile: string, cursor?: string): Promise<string> {
    return this.run('browser_read', profile, async (conn, s) => {
      const session = await this.ready(conn, s)
      const out = await conn.call('tool.observe', { session_id: session.id, max_tokens: READ_TOKENS, ...(cursor ? { cursor } : {}) })
      const cleaned = cleanOutline(out.text)
      const facts = elementFacts(out.text)
      session.facts = cursor ? new Map([...session.facts, ...facts]) : facts
      const digest = createHash('sha1').update(cleaned.text).digest('hex')
      if (!cursor && digest === session.lastRead) return 'No change since the last read.'
      session.lastRead = digest
      const more = cleaned.cursor ? `\n[more: read again with cursor "${cleaned.cursor}"]` : ''
      return untrusted(`${s.at}\n${cleaned.text}${more}`)
    })
  }

  find(profile: string, text: string): Promise<string> {
    return this.run('browser_find', profile, async (conn, s) => {
      const session = await this.ready(conn, s)
      const hits = await this.evaluate<string[]>(conn, session, page.find(text))
      return hits.length ? untrusted(hits.join('\n')) : `Nothing on the page matches ${quote(text)}.`
    })
  }

  links(profile: string, contains?: string): Promise<string> {
    return this.run('browser_links', profile, async (conn, s) => {
      const session = await this.ready(conn, s)
      const all = await this.evaluate<[string, string][]>(conn, session, page.links(contains))
      const shown = all.filter(([, href]) => classifyUrl(href, this.allowed(profile)) !== 'blocked')
      return shown.length ? untrusted(shown.map(([t, h]) => `${t} → ${h}`).join('\n')) : 'No links to allowed pages.'
    })
  }

  click(t: Target, confirm: Confirm): Promise<string> {
    return this.run('browser_click', t.profile, async (conn, s) => {
      const session = await this.ready(conn, s)
      const facts = await this.factsOf(conn, session, t)
      const reason = facts ? riskOfTarget(facts) : 'it is not an element from the last read'
      await this.ask(t.profile, `click ${facts?.role ?? 'element'} ${quote(facts?.name)} on ${s.at}`, reason, confirm)
      await conn.call('tool.click', { session_id: session.id, ...this.locator(t) })
      return this.landed(conn, session, 'Clicked')
    })
  }

  type(t: Target & { text: string; clear?: boolean }): Promise<string> {
    return this.run('browser_type', t.profile, async (conn, s) => {
      const session = await this.ready(conn, s)
      const facts = await this.factsOf(conn, session, t)
      if (!facts) throw new Error('That is not an element from the last read; read the page (or find) first.')
      const refusal = refuseTyping(facts)
      if (refusal) throw new Error(`Not typing into ${quote(facts.name)}: ${refusal}`)
      await conn.call('tool.fill', { session_id: session.id, value: t.text, clear_before: t.clear ?? true, ...this.locator(t) })
      return `Typed ${t.text.length} characters into ${quote(facts.name)}. Nothing was submitted.`
    })
  }

  press(profile: string, key: string, confirm: Confirm): Promise<string> {
    return this.run('browser_press', profile, async (conn, s) => {
      if (!keyAllowed(key)) throw new Error(`Key "${key}" is not allowed. Allowed: Enter, Tab, Escape, Space, arrows, PageUp, PageDown, Home, End, Backspace, Delete.`)
      const session = await this.ready(conn, s)
      const active = (await this.evaluate<ElementFacts | null>(conn, session, page.describeActive())) ?? {}
      await this.ask(profile, `press ${key} on ${quote(active.name)} at ${s.at}`, riskOfKey(key, active), confirm)
      await conn.call('tool.press', { session_id: session.id, key })
      return this.landed(conn, session, `Pressed ${key}`)
    })
  }

  wait(profile: string, target: { ref?: string; selector?: string }, state: 'visible' | 'hidden' | 'attached' | 'detached', seconds: number): Promise<string> {
    return this.run('browser_wait', profile, async (conn, s) => {
      const session = await this.ready(conn, s)
      const r = await conn.call('tool.wait_for_element', { session_id: session.id, state, timeout_ms: Math.min(seconds, 15) * 1000, ...this.locator(target) }, 20_000)
      return r.satisfied ? `Done after ${(r.elapsed_ms / 1000).toFixed(1)}s.` : `Not ${state} after ${seconds}s.`
    })
  }

  close(profile: string): Promise<string> {
    return this.run('browser_close', profile, async (conn) => {
      const session = this.sessions.get(conn)
      if (!session) return 'No session was open.'
      this.sessions.delete(conn)
      await conn.call('tool.session_stop', { session_id: session.id })
      return 'Closed the session; the browser window it used is gone.'
    })
  }

  private locator(t: { ref?: string; selector?: string }): Record<string, string> {
    if (t.ref) return { ref: t.ref.startsWith('@') ? t.ref : `@${t.ref}` }
    if (t.selector) return { selector: t.selector }
    throw new Error('Name the element with ref (from read) or selector (from find).')
  }

  private async factsOf(conn: BrowserConnection, session: Session, t: Target): Promise<ElementFacts | undefined> {
    if (t.ref) return session.facts.get(t.ref.replace(/^@/, ''))
    if (!t.selector) return undefined
    return (await this.evaluate<ElementFacts | null>(conn, session, page.describeSelector(t.selector))) ?? undefined
  }

  // A risky step goes to the owner's card; a plain one just runs.
  private async ask(profile: string, what: string, risk: string | undefined, confirm: Confirm): Promise<void> {
    const verdict = await authorize({ tier: 'act', detail: `Browser (${profile}): ${what}${risk ? ` (${risk})` : ''}`, risky: risk !== undefined }, confirm)
    if (!verdict.allow) throw new DeclinedError(verdict.reason)
  }

  private async session(conn: BrowserConnection, foreground: boolean): Promise<Session> {
    const known = this.sessions.get(conn)
    if (known) return known
    const session: Session = { id: newSessionId(), foreground, facts: new Map() }
    await conn.call('tool.session_start', { session_id: session.id, focused: foreground })
    this.sessions.set(conn, session)
    return session
  }

  // The session for a step that needs a page, after checking the page is one we may touch.
  private async ready(conn: BrowserConnection, s: { at?: string }): Promise<Session> {
    const session = this.sessions.get(conn)
    if (!session) throw new Error('No page is open for this profile. Use browser_open first.')
    const { url } = await this.where(conn, session)
    s.at = session.at
    const state = classifyUrl(url, this.allowed(conn.profile))
    if (state === 'blocked') throw new Error(`The page is on ${hostPath(url)}, which is not allowed for "${conn.profile}". Use browser_open to go somewhere allowed.`)
    if (state === 'needs_login') throw new Error(`The page is a sign-in (${hostPath(url)}). Ask the owner to sign in in that window; you cannot.`)
    return session
  }

  private async where(conn: BrowserConnection, session: Session): Promise<{ url: string; title: string }> {
    const [url, title] = await this.evaluate<[string, string]>(conn, session, page.where())
    session.at = hostPath(url)
    return { url, title }
  }

  private async landed(conn: BrowserConnection, session: Session, did: string): Promise<string> {
    const { url, title } = await this.where(conn, session)
    if (classifyUrl(url, this.allowed(conn.profile)) === 'blocked') return `${did}, and the page moved to ${hostPath(url)}, which is not allowed. Nothing there was read; use browser_open to go back.`
    return `${did}; now at ${session.at}, title ${quote(title)}.`
  }

  private async evaluate<T>(conn: BrowserConnection, session: Session, expression: string): Promise<T> {
    const r = await conn.call('tool.evaluate', { session_id: session.id, expression, return_by_value: true })
    if (!r.ok) throw new Error(`The page refused the script: ${r.error?.text ?? 'unknown error'}`)
    return JSON.parse(r.value as string) as T
  }

  private async run(tool: string, profile: string, fn: (conn: BrowserConnection, s: { at?: string }) => Promise<string>): Promise<string> {
    const state: { at?: string } = {}
    let conn: BrowserConnection | undefined
    try {
      conn = this.gateway.byProfile(profile)
      const out = await fn(conn, state)
      this.audit.record({ device: profile, tool, target: state.at, outcome: 'ok' })
      return out
    } catch (err) {
      const outcome = err instanceof DeclinedError ? 'declined' : err instanceof RpcFailure ? 'error' : 'refused'
      this.audit.record({ device: profile, tool, target: state.at, outcome })
      throw err instanceof RpcFailure ? new Error(`The browser said ${err.code}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`) : err
    }
  }
}
