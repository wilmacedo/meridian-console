import type { AgentMode, ScreenCommand, StreamMessage } from '@meridian/service-sdk'

interface Screen {
  send: (message: StreamMessage) => void
  workspace?: string
  // When it started showing that workspace; the newest screen of a workspace runs its commands.
  since: number
}

let nextId = 1

// The screens connected right now, and which workspace each shows. NOX acts on a workspace by
// asking one of its screens to run a command; the layout then reaches the others through the workspace.
export class ScreenRegistry {
  private screens = new Map<number, Screen>()
  private mode: AgentMode = 'idle'

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

  // Runs the command on the newest screen of the workspace. Returns false when none is showing it.
  dispatch(workspace: string, command: ScreenCommand): boolean {
    const target = [...this.screens.values()].filter((s) => s.workspace === workspace).sort((a, b) => b.since - a.since)[0]
    target?.send({ type: 'command', command })
    return target !== undefined
  }

  setAgentMode(mode: AgentMode): void {
    this.mode = mode
    for (const s of this.screens.values()) s.send({ type: 'agent', mode })
  }
}
