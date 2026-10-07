import type { AgentMode, DocSpec, ScreenCommand, StreamMessage } from '@meridian/service-sdk'

interface Screen {
  send: (message: StreamMessage) => void
  workspace?: string
  // The id the tab gave itself, so a request made there can be answered there.
  client?: string
  // When it started showing that workspace; the newest screen of a workspace runs its commands.
  since: number
}

let nextId = 1
// Orders screens by when they started showing their workspace; a clock can tie, a counter cannot.
let watchOrder = 0
const MAX_KEPT_DOCS = 50

// The screens connected right now, and which workspace each shows. NOX acts on a workspace by
// asking one of its screens to run a command; the layout then reaches the others through the workspace.
export class ScreenRegistry {
  private screens = new Map<number, Screen>()
  private mode: AgentMode = 'idle'
  private docs = new Map<string, DocSpec>()
  // Where a live document first appeared: its updates follow it there.
  private docHome = new Map<string, string>()

  add(send: (message: StreamMessage) => void): number {
    const key = nextId++
    this.screens.set(key, { send, since: 0 })
    send({ type: 'agent', mode: this.mode })
    return key
  }

  remove(key: number): void {
    this.screens.delete(key)
  }

  watch(key: number, workspace: string, client?: string): void {
    const screen = this.screens.get(key)
    if (screen) Object.assign(screen, { workspace, client, since: ++watchOrder })
  }

  // How many screens show each workspace.
  counts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const s of this.screens.values()) if (s.workspace) counts[s.workspace] = (counts[s.workspace] ?? 0) + 1
    return counts
  }

  private pick(workspace: string, preferred?: string): Screen | undefined {
    const shown = [...this.screens.values()].filter((s) => s.workspace === workspace)
    return shown.find((s) => preferred !== undefined && s.client === preferred) ?? shown.sort((a, b) => b.since - a.since)[0]
  }

  // Sends to the screen that asked (`preferred`, the id it gave itself), or failing that the newest screen
  // of the workspace. Returns false when none is showing it.
  sendTo(workspace: string, message: StreamMessage, preferred?: string): boolean {
    const target = this.pick(workspace, preferred)
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

  dispatch(workspace: string, command: ScreenCommand, preferred?: string): boolean {
    let target = preferred
    if (command.name === 'compose_doc' && command.doc.id) {
      const id = command.doc.id
      this.docs.delete(id)
      this.docs.set(id, command.doc)
      if (this.docs.size > MAX_KEPT_DOCS) {
        const oldest = this.docs.keys().next().value!
        this.docs.delete(oldest)
        this.docHome.delete(oldest)
      }
      // A live document stays on the screen it appeared on, so its updates are not split across tabs.
      const home = this.docHome.get(id)
      if (home !== undefined && this.pick(workspace, home)?.client === home) target = home
      else if (target !== undefined) this.docHome.set(id, target)
    }
    return this.sendTo(workspace, { type: 'command', command }, target)
  }

  setAgentMode(mode: AgentMode): void {
    this.mode = mode
    for (const s of this.screens.values()) s.send({ type: 'agent', mode })
  }
}
