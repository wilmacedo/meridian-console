import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { AuditLog } from '../audit.js'
import { KillSwitch } from '../kill-switch.js'
import { DeviceStore } from '../store.js'
import { AppTools, type AppPage, type Located } from './tools.js'

const anywh = { id: 'anywh', remotePort: 9223, localPort: 19223 }
const OUTLINE = { title: 'anywh', lines: ['h1 "Where is the relay running?"', '@a0 textbox "Host" [empty]', '@a1 button "Send"', '@a2 button "Cancel"', '@a3 textbox "Password"'], total: 5 }
const where: Record<number, Located> = {
  0: { facts: { name: 'Host', role: 'textbox', editable: true }, x: 10, y: 20 },
  1: { facts: { name: 'Send', role: 'button' }, x: 30, y: 40 },
  2: { facts: { name: 'Cancel', role: 'button' }, x: 50, y: 60 },
  3: { facts: { name: 'Password', role: 'textbox', type: 'password', editable: true }, x: 70, y: 80 },
}

function setup(over: { open?: () => Promise<AppPage>; reachable?: boolean; probe?: boolean[] } = {}) {
  const store = new DeviceStore(new DatabaseSync(':memory:'))
  const killSwitch = new KillSwitch(store)
  const logFile = join(mkdtempSync(join(tmpdir(), 'app-tools-')), 'audit.log')
  const sent: string[] = []
  const probe = [...(over.probe ?? [true])]
  const pageFake: AppPage = {
    evaluate: async <T,>(expr: string): Promise<T> => {
      sent.push(expr)
      const ref = /__nox\[(\d+)\]/.exec(expr)?.[1] ?? /&& window\.__nox\[(\d+)\]/.exec(expr)?.[1]
      if (expr.includes('window.__nox = els')) return JSON.stringify(OUTLINE) as T
      if (expr.includes('scrollIntoView')) return JSON.stringify(where[Number(/__nox\[(\d+)\]/.exec(expr)![1])] ?? null) as T
      if (expr.includes('e.focus()')) return true as T
      if (expr.includes('document.body.innerText') || expr.includes('querySelector')) return (probe.length > 1 ? probe.shift()! : probe[0]) as T
      void ref
      return null as T
    },
    click: vi.fn(async () => undefined),
    insertText: vi.fn(async () => undefined),
    close: vi.fn(),
  }
  const open = vi.fn(over.open ?? (async () => pageFake))
  const tools = new AppTools({ targets: [anywh], open, reachable: async () => over.reachable ?? true, audit: new AuditLog(logFile), killSwitch, sleep: async () => undefined })
  return { tools, pageFake, open, killSwitch, logFile, sent }
}

const yes = vi.fn(async () => true)
const no = vi.fn(async () => false)

describe('app_read', () => {
  it('returns a short outline marked as data and closes the connection', async () => {
    const { tools, pageFake } = setup()
    const out = await tools.read('anywh')
    expect(out).toMatch(/^\[Text below comes from a page, an app or a device and was written by others/)
    expect(out).toContain('@a1 button "Send"')
    expect(out.length).toBeLessThan(600)
    expect(pageFake.close).toHaveBeenCalled()
  })

  it('says how many controls it left out', async () => {
    const { tools, pageFake } = setup()
    const evaluate = pageFake.evaluate
    pageFake.evaluate = async <T,>(e: string): Promise<T> => (e.includes('window.__nox = els') ? (JSON.stringify({ ...OUTLINE, total: 90 }) as T) : evaluate<T>(e))
    expect(await tools.read('anywh')).toContain('[85 more not shown]')
  })

  it('refuses an app that is not set up, naming the ones that are', async () => {
    await expect(setup().tools.read('slack')).rejects.toThrow('Unknown app "slack". Set up: anywh.')
  })

  it('passes on why the app cannot be reached', async () => {
    const { tools } = setup({ open: async () => Promise.reject(new Error('The app is not listening on its debug port. Ask the owner to start anywh with …')) })
    await expect(tools.read('anywh')).rejects.toThrow('not listening on its debug port')
  })
})

describe('app_click', () => {
  it('clicks a harmless control with a real click at its position, without asking', async () => {
    const { tools, pageFake } = setup()
    const confirm = vi.fn(yes)
    expect(await tools.click({ app: 'anywh', ref: '@a2' }, confirm)).toBe('Clicked button "Cancel". Read again to see the result.')
    expect(pageFake.click).toHaveBeenCalledWith(50, 60)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks the owner before a control that sends or changes something, and clicks nothing when declined', async () => {
    const { tools, pageFake } = setup()
    const confirm = vi.fn(no)
    await expect(tools.click({ app: 'anywh', ref: 'a1' }, confirm)).rejects.toThrow(/did not confirm/)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('anywh: click button "Send"'))
    expect(pageFake.click).not.toHaveBeenCalled()
  })

  it('says the element is gone instead of clicking blindly', async () => {
    const { tools } = setup()
    await expect(tools.click({ app: 'anywh', ref: '@a9' }, yes)).rejects.toThrow('gone or hidden')
  })

  it('needs a ref from app_read', async () => {
    await expect(setup().tools.click({ app: 'anywh', ref: 'Connect' }, yes)).rejects.toThrow('ref from app_read')
  })
})

describe('the title bar of the app', () => {
  it('asks before the Close button of the window, which ends the app', async () => {
    const { tools, pageFake } = setup()
    where[7] = { facts: { name: 'Close', role: 'button' }, x: 1000, y: 12 }
    const confirm = vi.fn(no)
    await expect(tools.click({ app: 'anywh', ref: '@a7' }, confirm)).rejects.toThrow(/did not confirm/)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("it closes the app's window"))
    expect(pageFake.click).not.toHaveBeenCalled()
  })

  it('lets a Close lower in the window, such as a dialog, through', async () => {
    const { tools } = setup()
    where[8] = { facts: { name: 'Close', role: 'button' }, x: 400, y: 300 }
    const confirm = vi.fn(yes)
    await tools.click({ app: 'anywh', ref: '@a8' }, confirm)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('app_type', () => {
  it('focuses the field, replaces its text and never echoes it or submits', async () => {
    const { tools, pageFake } = setup()
    expect(await tools.type({ app: 'anywh', ref: '@a0', text: '10.0.0.5' })).toBe('Typed 8 characters into "Host". Nothing was submitted.')
    expect(pageFake.click).toHaveBeenCalledWith(10, 20)
    expect(pageFake.insertText).toHaveBeenCalledWith('10.0.0.5')
  })

  it('refuses a password field and a control that is not a text field', async () => {
    const { tools, pageFake } = setup()
    await expect(tools.type({ app: 'anywh', ref: '@a3', text: 'x' })).rejects.toThrow(/password, code or card/)
    await expect(tools.type({ app: 'anywh', ref: '@a1', text: 'x' })).rejects.toThrow(/not a text field/)
    expect(pageFake.insertText).not.toHaveBeenCalled()
  })
})

describe('app_wait', () => {
  it('returns as soon as the text shows up', async () => {
    const { tools } = setup({ probe: [false, false, true] })
    expect(await tools.wait({ app: 'anywh', text: 'Connected' })).toBe('It is there after 1.0s.')
  })

  it('gives up after the time asked, capped at 15 seconds', async () => {
    const { tools } = setup({ probe: [false] })
    expect(await tools.wait({ app: 'anywh', selector: '#x', seconds: 60 })).toBe('Not there after 15s.')
  })
})

describe('kill switch, status and audit', () => {
  it('refuses everything while the kill switch is on', async () => {
    const { tools, killSwitch, open } = setup()
    killSwitch.engage()
    await expect(tools.read('anywh')).rejects.toThrow('kill switch is on')
    expect(open).not.toHaveBeenCalled()
  })

  it('cuts a connection that is open when the kill switch is thrown', async () => {
    const { tools, killSwitch, pageFake } = setup()
    pageFake.evaluate = async <T,>(): Promise<T> => (killSwitch.engage(), JSON.stringify(OUTLINE) as T)
    await tools.read('anywh')
    expect(pageFake.close).toHaveBeenCalledTimes(2)
  })

  it('reports whether each app answers, without opening anything', async () => {
    expect(await setup({ reachable: false }).tools.status()).toContain('anywh: not reachable now')
    expect(await setup().tools.status()).toBe('anywh: its debug port answers')
  })

  it('logs the app and the outcome, never what was typed', async () => {
    const { tools, logFile } = setup()
    await tools.type({ app: 'anywh', ref: '@a0', text: 'secret-host' })
    await expect(tools.click({ app: 'anywh', ref: '@a1' }, no)).rejects.toThrow()
    const log = readFileSync(logFile, 'utf8')
    expect(log).not.toContain('secret-host')
    expect(log.trim().split('\n').map((l) => l.split(' ').slice(1).join(' '))).toEqual(['anywh app_type - ok', 'anywh app_click - declined'])
  })
})
