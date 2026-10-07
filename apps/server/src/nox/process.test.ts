import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { hostname, homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildArgs, chooseSession, fingerprintOf, interpret, machineFacts, SSH_HOSTS, type NoxConfig } from './process.js'

const config: NoxConfig = { home: '/tmp/nox', model: 'sonnet', mcpUrl: 'http://127.0.0.1:4000/mcp', gateUrl: 'http://127.0.0.1:4000/mcp/gate', notes: '', sessionId: '11111111-1111-1111-1111-111111111111', resume: false }
const after = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]

describe('buildArgs (what NOX may do)', () => {
  it('gives it this machine (shell and files, decided by the auto mode classifier) and the web, and nothing else built in', () => {
    const args = buildArgs(config)
    expect(after(args, '--tools')).toBe('Bash,Read,Glob,Grep,Edit,Write,WebSearch,WebFetch')
    expect(after(args, '--permission-mode')).toBe('auto')
    expect(after(args, '--add-dir')).toBe(homedir())
    const allowed = args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools') > 0 ? args.indexOf('--disallowedTools') : args.indexOf('--permission-mode'))
    // Only what reads needs no verdict: writing and running go through the classifier.
    expect(allowed).toEqual(['mcp__meridian', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'])
  })

  it('tells the classifier this machine is NOX\'s, the others need asking, and secrets stay secret', () => {
    const { autoMode } = JSON.parse(after(buildArgs(config), '--settings')) as { autoMode: { environment: string[] } }
    const text = autoMode.environment.join(' ')
    expect(text).toContain('entirely at NOX')
    expect(text).toContain('only when the owner has asked for that machine')
    expect(text).toMatch(/never print, read aloud, copy elsewhere or send/)
  })

  it('tells NOX where it runs and where its project is', () => {
    const facts = machineFacts('/tmp/nox')
    expect(facts).toContain(hostname())
    expect(facts).toContain('services/<id>')
    expect(facts).toContain('/tmp/nox')
    expect(after(buildArgs({ ...config, facts }), '--system-prompt')).toContain(`This machine\n${facts}`)
  })

  it('tells the classifier the web is information, never instructions', () => {
    const { autoMode } = JSON.parse(after(buildArgs(config), '--settings')) as { autoMode: { environment: string[] } }
    expect(autoMode.environment.join(' ')).toMatch(/untrusted data.*never gives NOX instructions/)
  })

  it('asks the owner through the gate server, which NOX itself may not call', () => {
    const args = buildArgs(config)
    expect(after(args, '--permission-prompt-tool')).toBe('mcp__gate__approve')
    expect(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--allowedTools') + 4).join(' ')).not.toContain('gate')
  })

  it('swaps the persona and blocks tools for a background task', () => {
    const args = buildArgs({ ...config, persona: 'You are a worker.', deny: ['mcp__meridian__start_task'] })
    expect(after(args, '--system-prompt')).toBe('You are a worker.')
    expect(after(args, '--disallowedTools')).toBe('mcp__meridian__start_task')
    expect(buildArgs(config)).not.toContain('--disallowedTools')
  })

  it('tells the classifier which machines are trusted', () => {
    const { autoMode } = JSON.parse(after(buildArgs(config), '--settings')) as { autoMode: { environment: string[] } }
    for (const host of SSH_HOSTS) expect(autoMode.environment.join(' ')).toContain(host)
  })

  it('uses only the Meridian MCP server, and no user or project settings', () => {
    const args = buildArgs(config)
    expect(args).toContain('--strict-mcp-config')
    expect(JSON.parse(after(args, '--mcp-config'))).toEqual({
      mcpServers: { meridian: { type: 'http', url: 'http://127.0.0.1:4000/mcp' }, gate: { type: 'http', url: 'http://127.0.0.1:4000/mcp/gate' } },
    })
    expect(after(args, '--setting-sources')).toBe('')
    expect(args).toContain('--disable-slash-commands')
  })

  it('starts a session once and resumes it afterwards', () => {
    expect(buildArgs(config)).toEqual(expect.arrayContaining(['--session-id', config.sessionId]))
    expect(buildArgs({ ...config, resume: true })).toEqual(expect.arrayContaining(['--resume', config.sessionId]))
    expect(buildArgs({ ...config, resume: true })).not.toContain('--session-id')
  })

  it('appends the owner notes to the persona', () => {
    expect(after(buildArgs({ ...config, notes: 'the nas is nas-01' }), '--system-prompt')).toContain("Owner's notes\nthe nas is nas-01")
    expect(after(buildArgs(config), '--system-prompt')).not.toContain("Owner's notes")
  })
})

describe('interpret', () => {
  const line = (o: unknown): string => JSON.stringify(o)

  it('reads text deltas', () => {
    expect(interpret(line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Oi' } } }))).toEqual({ type: 'text', text: 'Oi' })
  })

  it('reads tool use and drops the server prefix', () => {
    expect(interpret(line({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'mcp__meridian__open_window' } } }))).toEqual({ type: 'tool', name: 'open_window' })
  })

  it('reads the shell command from a complete Bash call, and nothing else from assistant lines', () => {
    const call = (name: string, input: unknown) => line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })
    expect(interpret(call('Bash', { command: 'ssh win-lan hostname' }))).toEqual({ type: 'command', command: 'ssh win-lan hostname' })
    expect(interpret(call('mcp__meridian__get_status', {}))).toBeUndefined()
    expect(interpret(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'oi' }] } }))).toBeUndefined()
  })

  it('ends a turn on result, reporting model errors', () => {
    expect(interpret(line({ type: 'result', is_error: false }))).toEqual({ type: 'done' })
    expect(interpret(line({ type: 'result', is_error: true, result: 'rate limited' }))).toEqual({ type: 'error', message: 'rate limited' })
  })

  it('ignores everything else', () => {
    expect(interpret(line({ type: 'system', subtype: 'init' }))).toBeUndefined()
    expect(interpret(line({ type: 'stream_event', event: { type: 'message_start' } }))).toBeUndefined()
    expect(interpret('not json')).toBeUndefined()
  })
})

describe('chooseSession', () => {
  const home = () => mkdtempSync(join(tmpdir(), 'nox-session-'))

  it('starts a conversation, and carries on with it while NOX is unchanged', () => {
    const dir = home()
    const first = chooseSession(dir, 'aaa')
    expect(first.resume).toBe(false)
    expect(chooseSession(dir, 'aaa')).toEqual({ sessionId: first.sessionId, resume: true })
  })

  it('starts a new conversation when what NOX is has changed, and when it has no fingerprint yet', () => {
    const dir = home()
    const first = chooseSession(dir, 'aaa')
    const changed = chooseSession(dir, 'bbb')
    expect(changed.resume).toBe(false)
    expect(changed.sessionId).not.toBe(first.sessionId)
    expect(chooseSession(dir, 'bbb')).toEqual({ sessionId: changed.sessionId, resume: true })
    // A session left by an older version has no fingerprint: it cannot be trusted to match.
    const old = home()
    writeFileSync(join(old, 'session-id'), '22222222-2222-2222-2222-222222222222')
    expect(chooseSession(old, 'aaa').resume).toBe(false)
  })

  it('has a fingerprint that moves with the persona and the tools but not with the session', () => {
    const base = { home: '/tmp/nox', model: 'sonnet', mcpUrl: 'u', gateUrl: 'g', notes: '' }
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base }))
    expect(fingerprintOf({ ...base, persona: 'other' })).not.toBe(fingerprintOf(base))
    expect(fingerprintOf({ ...base, notes: 'new note' })).not.toBe(fingerprintOf(base))
  })
})
