import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { StreamMessage } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import { Tasks, type TaskProcess } from './tasks.js'

function setup() {
  const bus = new EventBus()
  const screens = new ScreenRegistry()
  const sent: StreamMessage[] = []
  // The tab the other tests read is the newest; a task may be asked from an older one.
  const seenB: StreamMessage[] = []
  screens.watch(screens.add((m) => seenB.push(m)), 'default', 'tab-b')
  screens.watch(screens.add((m) => sent.push(m)), 'default', 'tab-a')
  const spawned: { args: string[]; stdout: PassThrough; stdin: PassThrough; killed: () => boolean; exit: (code: number) => void }[] = []
  const tasks = new Tasks({
    port: 4000,
    home: '/tmp/nox-tasks-test',
    model: 'sonnet',
    bus,
    screens,
    spawn: (args) => {
      const stdout = new PassThrough()
      const stdin = new PassThrough()
      let killed = false
      let close: (code: number | null) => void = () => undefined
      const process: TaskProcess = { stdin, stdout, stderr: new PassThrough(), kill: () => (killed = true), onClose: (l) => (close = l) }
      spawned.push({ args, stdout, stdin, killed: () => killed, exit: (c) => close(c) })
      return process
    },
  })
  const docs = () => sent.filter((m) => m.type === 'command').map((m) => (m as { command: { doc: { id: string; blocks: { title?: string; tone?: string }[] } } }).command.doc)
  const line = (o: unknown) => `${JSON.stringify(o)}\n`
  return { tasks, bus, spawned, docs, line, screensSeen: { a: sent, b: seenB } }
}

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('Tasks', () => {
  it('starts a worker with the task persona, the goal as its first message, and a live document', async () => {
    const { tasks, spawned, docs } = setup()
    const task = tasks.start('default', 'Disk audit', 'Check disks')
    const args = spawned[0].args
    expect(args[args.indexOf('--system-prompt') + 1]).toContain(`task-${task.id}`)
    expect(args[args.indexOf('--disallowedTools') + 1]).toBe('mcp__meridian__start_task')
    expect(args[args.indexOf('--mcp-config') + 1]).toContain('/mcp/gate/default')
    expect(spawned[0].stdin.read().toString()).toContain('Check disks')
    expect(docs()[0]).toMatchObject({ id: `task-${task.id}` })
  })

  it('shows the task document on the tab that asked, and keeps updating it there', async () => {
    const { tasks, spawned, line, screensSeen } = setup()
    tasks.start('default', 'T', 'g', 'tab-b')
    spawned[0].stdout.write(line({ type: 'result', is_error: true, result: 'boom' }))
    await tick()
    expect(screensSeen.b.filter((m) => m.type === 'command')).toHaveLength(2)
    expect(screensSeen.a.filter((m) => m.type === 'command')).toHaveLength(0)
  })

  it('finishes when the worker says it is done, and leaves its document alone', async () => {
    const { tasks, spawned, docs, bus, line } = setup()
    const task = tasks.start('default', 'T', 'g')
    spawned[0].stdout.write(line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Tudo certo.' } } }))
    spawned[0].stdout.write(line({ type: 'result', is_error: false }))
    await tick()
    expect(tasks.list()[0].state).toBe('done')
    expect(spawned[0].killed()).toBe(true)
    expect(docs()).toHaveLength(1)
    expect(bus.recent().at(-1)?.message).toBe(`task ${task.id} done: Tudo certo.`)
  })

  it('logs the shell commands a worker runs', async () => {
    const { tasks, spawned, bus, line } = setup()
    const task = tasks.start('default', 'T', 'g')
    spawned[0].stdout.write(line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ssh win-lan hostname' } }] } }))
    await tick()
    expect(bus.recent().at(-1)?.message).toBe(`task ${task.id} ran: ssh win-lan hostname`)
  })

  it('marks a failed worker on the document, once', async () => {
    const { tasks, spawned, docs, line } = setup()
    tasks.start('default', 'T', 'g')
    spawned[0].stdout.write(line({ type: 'result', is_error: true, result: 'rate limited' }))
    await tick()
    spawned[0].exit(1)
    expect(tasks.list()[0].state).toBe('failed')
    expect(docs()).toHaveLength(2)
    expect(docs()[1].blocks[0]).toMatchObject({ tone: 'bad', text: 'rate limited' })
  })

  it('tells subscribers when tasks start and end, and lists the running ones per workspace', async () => {
    const { tasks, spawned, line } = setup()
    let changes = 0
    tasks.subscribe(() => changes++)
    const task = tasks.start('default', 'T', 'g')
    expect(changes).toBe(1)
    expect(tasks.running('default')).toEqual([{ id: task.id, title: 'T' }])
    expect(tasks.running('elsewhere')).toEqual([])
    spawned[0].stdout.write(line({ type: 'result', is_error: false }))
    await tick()
    expect(changes).toBe(2)
    expect(tasks.running('default')).toEqual([])
  })

  it('stops a running task on request and only allows two at once', () => {
    const { tasks, spawned } = setup()
    const a = tasks.start('default', 'A', 'g')
    tasks.start('default', 'B', 'g')
    expect(() => tasks.start('default', 'C', 'g')).toThrow('already running')
    expect(tasks.stop(a.id)).toBe(true)
    expect(tasks.stop(a.id)).toBe(false)
    expect(spawned[0].killed()).toBe(true)
    expect(tasks.list()[0].state).toBe('stopped')
    expect(() => tasks.start('default', 'C', 'g')).not.toThrow()
  })
})
