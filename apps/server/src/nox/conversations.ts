import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Conversation {
  // The Claude Code session id.
  id: string
  title: string
  started: number
  // The last time the owner spoke in it.
  lastUsed: number
  // What NOX was (persona, tools, settings) the last time it spoke in it.
  fingerprint: string
}

interface Index {
  current?: string
  list: Conversation[]
}

const FILE = 'conversations.json'
const MAX_TITLE = 80

export const titleOf = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE)}…` : line || 'Sem título'
}

// NOX's conversations, one per subject, kept in its home so any of them can be taken up again. The sessions
// themselves are Claude Code's; this only remembers which exist, what each is about and which one is current.
export class Conversations {
  private index: Index

  constructor(
    private home: string,
    private now: () => number = Date.now,
  ) {
    this.index = this.load()
  }

  private load(): Index {
    try {
      return JSON.parse(readFileSync(join(this.home, FILE), 'utf8')) as Index
    } catch {
      return this.migrate()
    }
  }

  // The single session that came before conversations: it becomes the first one, untitled.
  private migrate(): Index {
    const read = (name: string): string | undefined => {
      try {
        return readFileSync(join(this.home, name), 'utf8').trim() || undefined
      } catch {
        return undefined
      }
    }
    const id = read('session-id')
    if (!id) return { list: [] }
    const at = this.now()
    const index: Index = { current: id, list: [{ id, title: 'Conversa anterior', started: at, lastUsed: at, fingerprint: read('prompt-hash') ?? '' }] }
    this.save(index)
    rmSync(join(this.home, 'session-id'), { force: true })
    rmSync(join(this.home, 'prompt-hash'), { force: true })
    return index
  }

  private save(index = this.index): void {
    writeFileSync(join(this.home, FILE), `${JSON.stringify(index, null, 2)}\n`)
  }

  current(): Conversation | undefined {
    return this.get(this.index.current ?? '')
  }

  get(id: string): Conversation | undefined {
    return this.index.list.find((c) => c.id === id)
  }

  // Newest first, by the last time the owner spoke in each.
  recent(limit: number): Conversation[] {
    return [...this.index.list].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, limit)
  }

  begin(id: string, title: string, fingerprint: string): void {
    const at = this.now()
    this.index.list.push({ id, title: titleOf(title), started: at, lastUsed: at, fingerprint })
    this.index.current = id
    this.save()
  }

  enter(id: string, fingerprint: string): void {
    const c = this.get(id)
    if (!c) return
    c.fingerprint = fingerprint
    this.index.current = id
    this.save()
  }

  touch(id: string): void {
    const c = this.get(id)
    if (!c) return
    c.lastUsed = this.now()
    this.save()
  }

  // Its history is gone: it can never be taken up again.
  forget(id: string): void {
    this.index.list = this.index.list.filter((c) => c.id !== id)
    if (this.index.current === id) this.index.current = undefined
    this.save()
  }

  // NOX has changed: the current conversation stays listed, but the next one starts fresh.
  leave(): void {
    this.index.current = undefined
    this.save()
  }
}

// How long ago, in words NOX reads well.
export function ago(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.round(hours / 24)} days ago`
}
