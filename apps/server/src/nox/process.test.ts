import { describe, expect, it } from 'vitest'
import { buildArgs, interpret, SSH_HOSTS, type NoxConfig } from './process.js'

const config: NoxConfig = { home: '/tmp/nox', model: 'sonnet', mcpUrl: 'http://127.0.0.1:4000/mcp', gateUrl: 'http://127.0.0.1:4000/mcp/gate', notes: '', sessionId: '11111111-1111-1111-1111-111111111111', resume: false }
const after = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]

describe('buildArgs (what NOX may do)', () => {
  it('offers Bash as the only built-in tool, decided by the auto mode classifier', () => {
    const args = buildArgs(config)
    expect(after(args, '--tools')).toBe('Bash')
    expect(after(args, '--permission-mode')).toBe('auto')
    expect(after(args, '--allowedTools')).toBe('mcp__meridian')
  })

  it('asks the owner through the gate server, which NOX itself may not call', () => {
    const args = buildArgs(config)
    expect(after(args, '--permission-prompt-tool')).toBe('mcp__gate__approve')
    expect(after(args, '--allowedTools')).not.toContain('gate')
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
