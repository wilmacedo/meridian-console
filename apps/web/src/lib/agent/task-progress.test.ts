import { describe, expect, it } from 'vitest'
import { currentStep, formatElapsed, stepNumber, taskProgress } from './task-progress'

const steps = [
  { label: 'a', state: 'done' as const },
  { label: 'b', state: 'active' as const },
  { label: 'c', state: 'todo' as const },
  { label: 'd', state: 'todo' as const },
]

describe('task progress', () => {
  it('counts the done steps over all of them', () => {
    expect(taskProgress(steps)).toBe(0.25)
    expect(taskProgress([])).toBe(0)
    expect(taskProgress(steps.map((s) => ({ ...s, state: 'done' as const })))).toBe(1)
  })

  it('finds the step being worked on, and numbers it', () => {
    expect(currentStep(steps)?.label).toBe('b')
    expect(stepNumber(steps)).toBe(2)
    expect(stepNumber([])).toBe(0)
    expect(stepNumber(steps.map((s) => ({ ...s, state: 'done' as const })))).toBe(4)
  })

  it('formats the elapsed time as mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_900)).toBe('01:05')
    expect(formatElapsed(-5)).toBe('00:00')
  })
})
