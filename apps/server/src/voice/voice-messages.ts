import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

// How long NOX's "record it now" holds: the owner answers in the next turn or not at all.
const ARMED_MS = 2 * 60_000
const NAME = /^message-\d+-[0-9a-f]+\.(webm|m4a|ogg|wav)$/

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }

// The owner's own voice, recorded to be sent somewhere (a WhatsApp voice note) rather than answered. NOX arms it
// for a workspace; the next recording from that workspace's screen is kept as a file instead of being transcribed.
// The files are temporary: gone once an action that was handed one succeeds, soon after otherwise.
export class VoiceMessages {
  private armed = new Map<string, { to: string; until: number }>()

  constructor(
    readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

  arm(workspace: string, to: string): void {
    this.armed.set(workspace, { to, until: this.now() + ARMED_MS })
  }

  // Who the next message of the workspace is for, once: arming is used up by the recording that answers it.
  take(workspace: string): string | undefined {
    const armed = this.armed.get(workspace)
    this.armed.delete(workspace)
    return armed && armed.until > this.now() ? armed.to : undefined
  }

  // Whether the workspace's next recording is a message, without using it up.
  waiting(workspace: string): boolean {
    const armed = this.armed.get(workspace)
    return armed !== undefined && armed.until > this.now()
  }

  disarm(): void {
    this.armed.clear()
  }

  async save(audio: Buffer, mime: string): Promise<string> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    const path = join(this.dir, `message-${this.now()}-${randomBytes(4).toString('hex')}.${EXTENSIONS[mime.split(';')[0]] ?? 'webm'}`)
    await writeFile(path, audio, { mode: 0o600 })
    return path
  }

  // Only a file this class made: the path comes from NOX's tool input.
  private owns(path: string): boolean {
    const full = resolve(path)
    return dirname(full) === resolve(this.dir) && NAME.test(basename(full))
  }

  async remove(path: string): Promise<void> {
    if (this.owns(path)) await rm(path, { force: true })
  }

  removeLater(path: string, ms: number): void {
    setTimeout(() => void this.remove(path).catch(() => undefined), ms).unref()
  }

  // What a crash or restart left behind.
  async sweep(olderThanMs: number): Promise<void> {
    const names = await readdir(this.dir).catch(() => [] as string[])
    for (const name of names) {
      const path = join(this.dir, name)
      if (!this.owns(path)) continue
      const info = await stat(path).catch(() => undefined)
      if (info && this.now() - info.mtimeMs > olderThanMs) await rm(path, { force: true })
    }
  }
}
