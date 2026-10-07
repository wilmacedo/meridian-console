import type { TaskStep } from '@meridian/service-sdk'

// 0-1: the share of steps done. A task that has not reported a plan yet has made no visible progress.
export function taskProgress(steps: TaskStep[]): number {
  if (!steps.length) return 0
  return steps.filter((s) => s.state === 'done').length / steps.length
}

// The step being worked on, else the first one still to do.
export const currentStep = (steps: TaskStep[]): TaskStep | undefined => steps.find((s) => s.state === 'active') ?? steps.find((s) => s.state === 'todo')

// 1-based number of that step for "STEP 02/04"; the last one once all are done.
export function stepNumber(steps: TaskStep[]): number {
  if (!steps.length) return 0
  const at = steps.findIndex((s) => s.state === 'active' || s.state === 'todo')
  return at < 0 ? steps.length : at + 1
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
