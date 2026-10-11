import type { AuditLog } from '../audit.js'
import type { KillSwitch } from '../kill-switch.js'
import { askOwner, DeclinedError, untrusted, type Confirm } from '../policy.js'
import { refuseTyping, riskOfTarget, type ElementFacts } from '../browser/risk.js'
import * as page from './page-scripts.js'
import type { AppTarget } from './targets.js'

// The part of a CDP session the tools use, so a test can stand in for the app's page.
export interface AppPage {
  evaluate: <T>(expression: string) => Promise<T>
  click: (x: number, y: number) => Promise<void>
  insertText: (text: string) => Promise<unknown>
  close: () => void
}

export interface AppToolsDeps {
  targets: AppTarget[]
  // Brings the tunnel up if needed and opens the app's page; rejects with what the owner has to do when it cannot.
  open: (app: AppTarget) => Promise<AppPage>
  // Whether the debug port answers right now, without opening anything.
  reachable: (app: AppTarget) => Promise<boolean>
  audit: AuditLog
  killSwitch: KillSwitch
  sleep?: (ms: number) => Promise<void>
}

export interface Located {
  facts: ElementFacts
  x: number
  y: number
}

const quote = (s: string | undefined): string => `"${(s ?? '').slice(0, 60)}"`

export class AppTools {
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly d: AppToolsDeps) {
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  async status(): Promise<string> {
    if (this.d.targets.length === 0) return 'No app is set up. Set MERIDIAN_DEVICES_APPS (see the devices README).'
    const lines = await Promise.all(this.d.targets.map(async (t) => `${t.id}: ${(await this.d.reachable(t)) ? 'its debug port answers' : 'not reachable now (the tunnel is closed, or the app is not running with the debug option)'}`))
    return lines.join('\n')
  }

  read(app: string): Promise<string> {
    return this.run('app_read', app, async (p) => {
      const o = JSON.parse(await p.evaluate<string>(page.outline())) as { title: string; lines: string[]; total: number }
      const more = o.total > o.lines.length ? `\n[${o.total - o.lines.length} more not shown]` : ''
      return untrusted(`${o.title}\n${o.lines.join('\n')}${more}`)
    })
  }

  click(t: { app: string; ref: string }, confirm: Confirm): Promise<string> {
    return this.run('app_click', t.app, async (p) => {
      const at = await this.locate(p, t.ref)
      await askOwner(t.app, `click ${at.facts.role ?? 'element'} ${quote(at.facts.name)}`, riskOfTarget(at.facts), confirm)
      await p.click(at.x, at.y)
      return `Clicked ${at.facts.role ?? 'element'} ${quote(at.facts.name)}. Read again to see the result.`
    })
  }

  type(t: { app: string; ref: string; text: string; clear?: boolean }): Promise<string> {
    return this.run('app_type', t.app, async (p) => {
      const at = await this.locate(p, t.ref)
      const refusal = refuseTyping(at.facts)
      if (refusal) throw new Error(`Not typing into ${quote(at.facts.name)}: ${refusal}`)
      await p.click(at.x, at.y)
      if (t.clear !== false) await p.evaluate(page.selectAll(this.index(t.ref)))
      await p.insertText(t.text)
      return `Typed ${t.text.length} characters into ${quote(at.facts.name)}. Nothing was submitted.`
    })
  }

  wait(t: { app: string; text?: string; selector?: string; seconds?: number }): Promise<string> {
    return this.run('app_wait', t.app, async (p) => {
      if (!t.text && !t.selector) throw new Error('Say what to wait for: text or selector.')
      const seconds = Math.min(t.seconds ?? 10, 15)
      for (let waited = 0; waited <= seconds * 1000; waited += 500) {
        if (await p.evaluate<boolean>(page.waitProbe(t))) return `It is there${waited ? ` after ${(waited / 1000).toFixed(1)}s` : ''}.`
        await this.sleep(500)
      }
      return `Not there after ${seconds}s.`
    })
  }

  private index(ref: string): number {
    const m = /^@?a(\d+)$/.exec(ref)
    if (!m) throw new Error('Name the element with a ref from app_read, like "@a3".')
    return Number(m[1])
  }

  private async locate(p: AppPage, ref: string): Promise<Located> {
    const at = JSON.parse(await p.evaluate<string>(page.locate(this.index(ref)))) as Located | null
    if (!at) throw new Error('That element is gone or hidden; read the app again.')
    return at
  }

  private async run(tool: string, app: string, fn: (p: AppPage) => Promise<string>): Promise<string> {
    let outcome: 'ok' | 'refused' | 'declined' = 'ok'
    let session: AppPage | undefined
    try {
      const target = this.d.targets.find((t) => t.id === app)
      if (!target) throw new Error(`Unknown app "${app}". Set up: ${this.d.targets.map((t) => t.id).join(', ') || 'none'}.`)
      if (this.d.killSwitch.engaged()) throw new Error('The kill switch is on: devices are cut off until the owner turns it off.')
      session = await this.d.open(target)
      if (!this.d.killSwitch.admit(session)) throw new Error('The kill switch is on: devices are cut off until the owner turns it off.')
      return await fn(session)
    } catch (err) {
      outcome = err instanceof DeclinedError ? 'declined' : 'refused'
      throw err
    } finally {
      if (session) {
        this.d.killSwitch.release(session)
        session.close()
      }
      this.d.audit.record({ device: app, tool, outcome })
    }
  }
}
