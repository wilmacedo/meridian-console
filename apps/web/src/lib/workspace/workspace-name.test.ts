import type { WorkspaceSummary } from '@meridian/service-sdk'
import { describe, expect, it } from 'vitest'
import { nameProblem } from './workspace-name'

const existing: WorkspaceSummary[] = [{ id: 'default', name: 'Default', version: 1, updatedAt: '' }, { id: 'vertical', name: 'Vertical', version: 1, updatedAt: '' }]

describe('nameProblem', () => {
  it('accepts a new name, trimmed', () => {
    expect(nameProblem('  Left monitor ', existing)).toBeUndefined()
  })

  it('asks for a name when there is none', () => {
    expect(nameProblem('   ', existing)).toBe('NAME IT')
  })

  it('refuses a name that exists, whatever its case', () => {
    expect(nameProblem('vertical', existing)).toBe('ALREADY EXISTS')
    expect(nameProblem(' DEFAULT ', existing)).toBe('ALREADY EXISTS')
  })
})
