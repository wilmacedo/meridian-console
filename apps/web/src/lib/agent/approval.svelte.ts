import { sendToServer } from '../live/stream.svelte'
import { play } from '../sound/sfx.svelte'

export interface Approval {
  id: string
  tool: string
  detail: string
}

// What NOX is waiting for the owner to confirm, oldest first; the card shows the first.
export const approvals = $state({ pending: [] as Approval[] })

export function showApproval(a: Approval): void {
  approvals.pending.push(a)
  play('approval')
}

export function hideApproval(id: string): void {
  approvals.pending = approvals.pending.filter((a) => a.id !== id)
}

export function clearApprovals(): void {
  approvals.pending = []
}

export function answerApproval(allow: boolean): void {
  const current = approvals.pending[0]
  if (!current) return
  sendToServer({ type: 'approval_answer', id: current.id, allow })
  hideApproval(current.id)
}

// Esc says no. Returns whether there was a card to answer, like the other overlays.
export function denyApproval(): boolean {
  if (approvals.pending.length === 0) return false
  answerApproval(false)
  return true
}
