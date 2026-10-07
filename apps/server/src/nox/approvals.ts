import { randomUUID } from 'node:crypto'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'

// A card nobody answers must not hold NOX's turn forever.
export const APPROVAL_TIMEOUT_MS = 60_000
const MAX_DETAIL = 600

interface Pending {
  workspace: string
  tool: string
  settle: (allow: boolean) => void
}

// Risky things NOX wants to do wait here for the owner: a card on the screen that spoke, answered by
// a tap or by voice. Nothing is allowed unless a person said so; no screen, no answer or a timeout is a no.
export class Approvals {
  private pending = new Map<string, Pending>()

  constructor(
    private screens: ScreenRegistry,
    private bus: EventBus,
  ) {}

  ask(workspace: string, tool: string, input: unknown): Promise<boolean> {
    const detail = describe(input)
    const id = randomUUID()
    if (!this.screens.sendTo(workspace, { type: 'approval', id, tool, detail })) {
      this.bus.emit('nox', 'warn', `denied ${tool}: no screen to confirm on: ${detail}`)
      return Promise.resolve(false)
    }
    this.bus.emit('nox', 'info', `waiting for confirmation of ${tool}: ${detail}`)
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.answer(id, false, 'no answer in time'), APPROVAL_TIMEOUT_MS)
      this.pending.set(id, {
        workspace,
        tool,
        settle: (allow) => {
          clearTimeout(timer)
          resolve(allow)
        },
      })
    })
  }

  // False when the card was already answered, or never existed.
  answer(id: string, allow: boolean, reason = 'the owner answered'): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    this.pending.delete(id)
    p.settle(allow)
    this.screens.sendTo(p.workspace, { type: 'approval_end', id })
    this.bus.emit('nox', allow ? 'info' : 'warn', `${allow ? 'allowed' : 'denied'} ${p.tool} (${reason})`)
    return true
  }

  // The spoken answer applies to the newest card of the workspace.
  answerLatest(workspace: string, allow: boolean): boolean {
    const id = [...this.pending].reverse().find(([, p]) => p.workspace === workspace)?.[0]
    return id !== undefined && this.answer(id, allow, 'by voice')
  }

  has(workspace: string): boolean {
    return [...this.pending.values()].some((p) => p.workspace === workspace)
  }
}

function describe(input: unknown): string {
  const command = (input as { command?: unknown } | null)?.command
  const text = typeof command === 'string' ? command : JSON.stringify(input)
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text
}

const YES = /\b(confirma|confirmo|confirmado|sim|pode|pode sim|manda|faz|autorizo|autorizado|libera|isso)\b/i
const NO = /\b(n[aã]o|nega|negado|cancela|cancelar|para|pare|deixa|recuso)\b/i

// What the owner said about a card. Anything unclear is left unanswered rather than guessed, and a "no"
// wins over a "yes" in the same sentence.
export function spokenAnswer(heard: string): boolean | undefined {
  if (NO.test(heard)) return false
  if (YES.test(heard)) return true
  return undefined
}

// The model-facing result Claude Code expects from a permission prompt tool.
export function verdict(allow: boolean, input: unknown): string {
  return JSON.stringify(allow ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'The owner did not confirm this.' })
}
