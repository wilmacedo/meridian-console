import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Emit } from '@meridian/service-sdk/server'

// Exit codes of the Go bridge (bridge/main.go).
const LOGGED_OUT = 3
const LOCKED = 5

const MIN_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000
const STABLE_MS = 60_000

export interface BridgeSpec {
  bin: string
  dataDir: string
  addr: string
  token: string
}

// Keeps the bridge running next to the server: restarts it with a growing pause when it dies. When another
// bridge holds the session it waits the longest pause between tries instead of fighting over it.
export class BridgeProcess {
  private child: ChildProcess | undefined
  private timer: NodeJS.Timeout | undefined
  private delay = MIN_DELAY_MS
  private stopped = true
  problem: string | undefined

  constructor(
    private readonly spec: BridgeSpec,
    private readonly emit: Emit,
  ) {}

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.launch()
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
    this.child?.kill('SIGTERM')
    this.child = undefined
  }

  private launch(): void {
    if (!existsSync(this.spec.bin)) {
      this.problem = 'the bridge is not built: run services/whatsapp/scripts/build-bridge.sh'
      return
    }
    const startedAt = Date.now()
    const child = spawn(this.spec.bin, [], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, WA_DATA_DIR: this.spec.dataDir, WA_ADDR: this.spec.addr, WA_TOKEN: this.spec.token },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    this.child = child
    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) this.emit('warn', `whatsapp bridge: ${line.trim().slice(0, 300)}`)
    })
    child.on('spawn', () => {
      this.problem = undefined
    })
    child.on('error', (error) => {
      this.problem = `the bridge could not start: ${error.message}`
    })
    child.on('exit', (code) => {
      if (this.child !== child || this.stopped) return
      this.child = undefined
      if (code === LOCKED) {
        this.problem = 'another process already runs the bridge on this session'
        this.emit('warn', `whatsapp: ${this.problem}`)
        this.delay = MAX_DELAY_MS
      }
      if (code === LOGGED_OUT) this.emit('warn', 'whatsapp: the phone logged this device out; pair it again')
      if (Date.now() - startedAt > STABLE_MS) this.delay = MIN_DELAY_MS
      this.timer = setTimeout(() => this.launch(), this.delay)
      this.delay = Math.min(this.delay * 2, MAX_DELAY_MS)
    })
  }
}
