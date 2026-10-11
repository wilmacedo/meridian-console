import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { AuditLog } from '../audit.js'
import { KillSwitch } from '../kill-switch.js'
import { DeviceStore } from '../store.js'
import { BrowserGateway } from './gateway.js'
import { FakeExtension } from './test-support.js'
import { BrowserTools } from './tools.js'
import { parseAllowlist } from './allowlist.js'

const OUTLINE = [
  '@vom 1',
  '@layers 1 focus=L0',
  'L0 page',
  '  banner "Site"',
  '    @e1 link "Home"',
  '    search',
  '      form',
  '        @e2 combobox "Search"',
  '    @e3 button "Send message"',
  '  form',
  '    @e4 textbox "Senha"',
  '    @e5 textbox "Comment"',
  '    @e6 button "Go"',
  '  @e7 button "Menu"',
].join('\n')

// A browser on a page: answers the tool calls the way the real extension does, from a small script.
function browser(opts: { url?: string; outline?: string; allowed?: string; evaluate?: (expr: string) => unknown } = {}) {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const gateway = new BrowserGateway({ store, killSwitch: new KillSwitch(store) })
  const logFile = join(mkdtempSync(join(tmpdir(), 'tools-')), 'audit.log')
  const tools = new BrowserTools(gateway, new AuditLog(logFile), parseAllowlist(opts.allowed))
  const ext = new FakeExtension()
  gateway.attach(ext.socket, store.addDevice('browser', 'b', 't', null))
  ext.hello('personal')
  const page = { url: opts.url ?? 'https://example.com/home', title: 'Example', outline: opts.outline ?? OUTLINE }
  const calls: { method: string; params: Record<string, unknown> }[] = []
  ext.on('frame', (f: { id: string; method?: string; params?: Record<string, unknown> }) => {
    if (!f.method?.startsWith('tool.')) return
    calls.push({ method: f.method, params: f.params ?? {} })
    const reply = (): unknown => {
      switch (f.method) {
        case 'tool.session_start':
          return {}
        case 'tool.navigate':
          page.url = f.params!.url as string
          return { reached: 'load', url: page.url, tab_id: 1 }
        case 'tool.observe':
          return { text: page.outline, ref_count: 7, tab_id: 1 }
        case 'tool.evaluate': {
          const expr = f.params!.expression as string
          const custom = opts.evaluate?.(expr)
          if (custom !== undefined) return { ok: true, tab_id: 1, value: JSON.stringify(custom) }
          return { ok: true, tab_id: 1, value: JSON.stringify(expr.includes('location.href') ? [page.url, page.title] : null) }
        }
        case 'tool.fill':
          return { tab_id: 1, value_length: (f.params!.value as string).length }
        case 'tool.session_stop':
          return {}
        default:
          return { tab_id: 1, x: 1, y: 1 }
      }
    }
    queueMicrotask(() => ext.say({ id: f.id, result: reply() }))
  })
  return { tools, calls, page, logFile }
}

const yes = vi.fn(async () => true)
const no = vi.fn(async () => false)
const open = (b: ReturnType<typeof browser>, url = 'https://example.com/home') => b.tools.open('personal', url, false)

describe('open', () => {
  it('starts one background session, navigates and says where it landed', async () => {
    const b = browser()
    expect(await open(b)).toBe('Opened example.com/home, title "Example".')
    expect(b.calls[0]).toMatchObject({ method: 'tool.session_start', params: { focused: false } })
    await open(b, 'https://example.com/other')
    expect(b.calls.filter((c) => c.method === 'tool.session_start')).toHaveLength(1)
  })

  it('opens in the foreground when asked', async () => {
    const b = browser()
    await b.tools.open('personal', 'https://example.com/', true)
    expect(b.calls[0].params.focused).toBe(true)
  })

  it('refuses a host outside the profile allowlist, and plain http', async () => {
    const b = browser({ allowed: 'personal=example.com' })
    await expect(open(b, 'https://evil.test/')).rejects.toThrow(/not allowed/)
    await expect(open(b, 'http://example.com/')).rejects.toThrow(/not allowed/)
    expect(b.calls).toHaveLength(0)
  })

  it('stops at a sign-in page instead of reading it', async () => {
    const b = browser()
    expect(await open(b, 'https://example.com/login')).toMatch(/asks to sign in/)
    await expect(b.tools.read('personal')).rejects.toThrow(/sign-in/)
  })

  it('reports a browser that is not connected, naming the ones that are', async () => {
    const b = browser()
    await expect(b.tools.open('work', 'https://example.com/', false)).rejects.toThrow('No browser called "work" is connected (connected: personal)')
  })
})

describe('read', () => {
  it('returns a cleaned outline marked as data, capped at 1500 tokens', async () => {
    const b = browser()
    await open(b)
    const out = await b.tools.read('personal')
    expect(out).toMatch(/^\[Page text below was written by others/)
    expect(out).toContain('@e3 button "Send message"')
    expect(out).not.toContain('@vom')
    expect(b.calls.find((c) => c.method === 'tool.observe')?.params.max_tokens).toBe(1500)
  })

  it('says "no change" for an unchanged page, and reads again after the page changes', async () => {
    const b = browser()
    await open(b)
    await b.tools.read('personal')
    expect(await b.tools.read('personal')).toBe('No change since the last read.')
    b.page.outline += '\n  @e8 button "New"'
    expect(await b.tools.read('personal')).toContain('@e8')
  })

  it('refuses to read once the page has wandered off the allowlist', async () => {
    const b = browser({ allowed: 'personal=example.com' })
    await open(b)
    b.page.url = 'https://evil.test/x'
    await expect(b.tools.read('personal')).rejects.toThrow(/not allowed/)
  })

  it('needs a page first', async () => {
    await expect(browser().tools.read('personal')).rejects.toThrow(/browser_open first/)
  })
})

describe('click', () => {
  it('just clicks a harmless control and answers in one line without re-reading the page', async () => {
    const b = browser()
    await open(b)
    await b.tools.read('personal')
    const confirm = vi.fn(yes)
    expect(await b.tools.click({ profile: 'personal', ref: '@e1' }, confirm)).toBe('Clicked; now at example.com/home, title "Example".')
    expect(confirm).not.toHaveBeenCalled()
    expect(b.calls.at(-2)).toMatchObject({ method: 'tool.click', params: { ref: '@e1' } })
    expect(b.calls.some((c, i) => c.method === 'tool.observe' && i > b.calls.findIndex((x) => x.method === 'tool.click'))).toBe(false)
  })

  it('asks the owner before a label that sends, and does nothing when they decline', async () => {
    const b = browser()
    await open(b)
    await b.tools.read('personal')
    const confirm = vi.fn(no)
    await expect(b.tools.click({ profile: 'personal', ref: 'e3' }, confirm)).rejects.toThrow(/did not confirm/)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('click button "Send message" on example.com/home'))
    expect(b.calls.some((c) => c.method === 'tool.click')).toBe(false)
    expect(await b.tools.click({ profile: 'personal', ref: 'e3' }, yes)).toMatch(/^Clicked/)
  })

  it('asks for a button inside a form, which it takes to submit, but not for a search box', async () => {
    const b = browser()
    await open(b)
    await b.tools.read('personal')
    const confirm = vi.fn(yes)
    await b.tools.click({ profile: 'personal', ref: 'e6' }, confirm)
    expect(confirm).toHaveBeenCalledOnce()
    await b.tools.click({ profile: 'personal', ref: 'e2' }, confirm)
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('asks when the ref was not in the last read', async () => {
    const b = browser()
    await open(b)
    const confirm = vi.fn(yes)
    await b.tools.click({ profile: 'personal', ref: '@e99' }, confirm)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('not an element from the last read'))
  })

  it('refuses a click once the page has left the allowlist', async () => {
    const b = browser({ allowed: 'personal=example.com' })
    await open(b)
    await b.tools.read('personal')
    b.page.url = 'https://evil.test/'
    b.calls.length = 0
    const clicking = b.tools.click({ profile: 'personal', ref: 'e1' }, yes)
    await expect(clicking).rejects.toThrow(/not allowed/)
  })
})

describe('type', () => {
  it('types without submitting and never echoes the text back', async () => {
    const b = browser()
    await open(b)
    await b.tools.read('personal')
    const out = await b.tools.type({ profile: 'personal', ref: 'e5', text: 'hello there' })
    expect(out).toBe('Typed 11 characters into "Comment". Nothing was submitted.')
    expect(b.calls.at(-1)).toMatchObject({ method: 'tool.fill', params: { value: 'hello there', ref: '@e5' } })
    expect(b.calls.some((c) => c.method === 'tool.press')).toBe(false)
  })

  it('refuses a password field and a control that is not a text field', async () => {
    const b = browser()
    await open(b)
    await b.tools.read('personal')
    await expect(b.tools.type({ profile: 'personal', ref: 'e4', text: 'x' })).rejects.toThrow(/password, code or card/)
    await expect(b.tools.type({ profile: 'personal', ref: 'e7', text: 'x' })).rejects.toThrow(/not a text field/)
    expect(b.calls.some((c) => c.method === 'tool.fill')).toBe(false)
  })
})

describe('press', () => {
  it('refuses keys outside the safe list', async () => {
    const b = browser()
    await open(b)
    await expect(b.tools.press('personal', 'F5', yes)).rejects.toThrow(/not allowed/)
  })

  it('asks for Enter inside a form field, not for Tab', async () => {
    const b = browser({ evaluate: (expr) => (expr.includes('activeElement') ? { name: 'Comment', role: 'textbox', editable: true, inForm: true } : undefined) })
    await open(b)
    const confirm = vi.fn(yes)
    await b.tools.press('personal', 'Tab', confirm)
    expect(confirm).not.toHaveBeenCalled()
    await b.tools.press('personal', 'Enter', confirm)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Enter inside a form submits it'))
  })
})

describe('narrow tools', () => {
  it('find returns a few lines from the page script, marked as data', async () => {
    const b = browser({ evaluate: (expr) => (expr.includes('needle') ? ['button "Subscribe" #sub'] : undefined) })
    await open(b)
    const out = await b.tools.find('personal', 'subscribe')
    expect(out).toContain('button "Subscribe" #sub')
    expect(out.split('\n').length).toBe(2)
  })

  it('links keeps only links to allowed pages', async () => {
    const b = browser({ allowed: 'personal=example.com', evaluate: (expr) => (expr.includes('a[href]') ? [['Good', 'https://example.com/a'], ['Bad', 'https://evil.test/b']] : undefined) })
    await open(b)
    const out = await b.tools.links('personal')
    expect(out).toContain('Good → https://example.com/a')
    expect(out).not.toContain('evil')
  })
})

describe('close and audit', () => {
  it('closes the session', async () => {
    const b = browser()
    await open(b)
    expect(await b.tools.close('personal')).toMatch(/Closed/)
    expect(b.calls.at(-1)?.method).toBe('tool.session_stop')
    expect(await b.tools.close('personal')).toBe('No session was open.')
  })

  it('logs one line per call with host and path only', async () => {
    const b = browser()
    await open(b, 'https://example.com/path?token=secret')
    await b.tools.read('personal')
    await expect(b.tools.click({ profile: 'personal', ref: 'e3' }, no)).rejects.toThrow()
    const log = readFileSync(b.logFile, 'utf8')
    expect(log).not.toMatch(/token|secret|Send message/)
    expect(log.trim().split('\n').map((l) => l.split(' ').slice(1).join(' '))).toEqual(['personal browser_open example.com/path ok', 'personal browser_read example.com/path ok', 'personal browser_click example.com/path declined'])
  })
})
