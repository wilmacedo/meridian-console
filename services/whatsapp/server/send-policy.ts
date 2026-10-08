import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

// The main thing that keeps an account out of trouble, and a stop for a runaway loop: it lives in the service,
// not only in the persona. It is checked before the owner is asked, so they are not bothered for a send that
// would be refused anyway.
export class SendLimiter {
  private sent: number[] = []

  constructor(
    private readonly perMinute = 6,
    private readonly perHour = 40,
    private readonly now: () => number = Date.now,
  ) {}

  check(): void {
    const t = this.now()
    this.sent = this.sent.filter((s) => t - s < HOUR_MS)
    if (this.sent.length >= this.perHour) throw new Error(`that is ${this.perHour} sends in the last hour; wait before sending more`)
    if (this.sent.filter((s) => t - s < MINUTE_MS).length >= this.perMinute) throw new Error('too many sends in a minute; wait a little')
  }

  record(): void {
    this.sent.push(this.now())
  }
}

const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

// Only files in the folders the owner made available can leave: otherwise a message that tricked NOX could mail
// out any file it can read. Symlinks are resolved first so a link inside a folder cannot point outside it.
export async function allowedFile(path: string, roots: string[]): Promise<string> {
  if (!isAbsolute(path)) throw new Error('path must be absolute')
  const real = await realpath(path).catch(() => {
    throw new Error('that file does not exist')
  })
  for (const root of roots) {
    const realRoot = await realpath(resolve(root)).catch(() => undefined)
    if (realRoot && inside(realRoot, real)) return real
  }
  throw new Error('that file is outside the folders WhatsApp may send from (WHATSAPP_SEND_DIRS); ask the owner to put it in one')
}
