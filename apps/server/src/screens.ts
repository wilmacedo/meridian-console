import type { AgentMode, DocSpec, ScreenCommand, StreamMessage } from '@meridian/service-sdk'

interface Screen {
  send: (message: StreamMessage) => void
  workspace?: string
  // When it started showing that workspace; the newest screen of a workspace runs its commands.
  since: number
}

let nextId = 1
const MAX_KEPT_DOCS = 50

// The screens connected right now, and which workspace each shows. NOX acts on a workspace by
// asking one of its screens to run a command; the layout then reaches the others through the workspace.
export class ScreenRegistry {
  private screens = new Map<number, Screen>()
  private mode: AgentMode = 'idle'
  private docs = new Map<string, DocSpec>()

  add(send: (message: StreamMessage) => void): number {
    const key = nextId++
    this.screens.set(key, { send, since: 0 })
    send({ type: 'agent', mode: this.mode })
    return key
  }

  remove(key: number): void {
    this.screens.delete(key)
  }

  watch(key: number, workspace: string): void {
    const screen = this.screens.get(key)
    if (screen) Object.assign(screen, { workspace, since: Date.now() })
  }

  // How many screens show each workspace.
  counts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const s of this.screens.values()) if (s.workspace) counts[s.workspace] = (counts[s.workspace] ?? 0) + 1
    return counts
  }

  // Sends to the newest screen of the workspace (the one that spoke, in practice). Returns false when
  // none is showing it.
  sendTo(workspace: string, message: StreamMessage): boolean {
    const target = [...this.screens.values()].filter((s) => s.workspace === workspace).sort((a, b) => b.since - a.since)[0]
    target?.send(message)
    return target !== undefined
  }

  // Sends to every screen of the workspace, for what any of them may answer. Returns how many got it.
  sendToAll(workspace: string, message: StreamMessage): number {
    const targets = [...this.screens.values()].filter((s) => s.workspace === workspace)
    for (const s of targets) s.send(message)
    return targets.length
  }

  // The latest version of every live document, so a screen can open one it did not see being composed.
  doc(id: string): DocSpec | undefined {
    return this.docs.get(id)
  }

  dispatch(workspace: string, command: ScreenCommand): boolean {
    if (command.name === 'compose_doc' && command.doc.id) {
      this.docs.delete(command.doc.id)
      this.docs.set(command.doc.id, command.doc)
      if (this.docs.size > MAX_KEPT_DOCS) this.docs.delete(this.docs.keys().next().value!)
    }
    return this.sendTo(workspace, { type: 'command', command })
  }

  setAgentMode(mode: AgentMode): void {
    this.mode = mode
    for (const s of this.screens.values()) s.send({ type: 'agent', mode })
  }
}
