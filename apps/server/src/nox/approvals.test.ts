import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StreamMessage } from '@meridian/service-sdk'
import { EventBus } from '../event-bus.js'
import { ScreenRegistry } from '../screens.js'
import { Approvals, APPROVAL_TIMEOUT_MS, spokenAnswer, verdict } from './approvals.js'

let sent: StreamMessage[]
let other: StreamMessage[]
let approvals: Approvals
let bus: EventBus

beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  other = []
  bus = new EventBus()
  const screens = new ScreenRegistry()
  const key = screens.add((m) => sent.push(m))
  screens.watch(key, 'default')
  screens.watch(screens.add((m) => other.push(m)), 'default')
  approvals = new Approvals(screens, bus)
})
afterEach(() => vi.useRealTimers())

const card = (): Extract<StreamMessage, { type: 'approval' }> => sent.find((m) => m.type === 'approval') as Extract<StreamMessage, { type: 'approval' }>

describe('Approvals', () => {
  it('shows a card and resolves with the answer, then dismisses the card', async () => {
    const result = approvals.ask('default', 'Bash', { command: 'ssh win-lan docker restart web' })
    expect(card()).toMatchObject({ tool: 'Bash', detail: 'ssh win-lan docker restart web' })
    expect(approvals.answer(card().id, true)).toBe(true)
    await expect(result).resolves.toBe(true)
    expect(sent.at(-1)).toEqual({ type: 'approval_end', id: card().id })
    expect(approvals.answer(card().id, false)).toBe(false)
  })

  it('shows the card on every screen of the workspace and dismisses it on all of them', async () => {
    const result = approvals.ask('default', 'Bash', { command: 'x' })
    expect(other.some((m) => m.type === 'approval')).toBe(true)
    approvals.answer(card().id, false)
    await result
    expect(other.at(-1)).toMatchObject({ type: 'approval_end' })
    expect(sent.at(-1)).toMatchObject({ type: 'approval_end' })
  })

  it('denies at once when no screen shows the workspace', async () => {
    await expect(approvals.ask('elsewhere', 'Bash', { command: 'rm -rf x' })).resolves.toBe(false)
    expect(bus.recent().at(-1)?.level).toBe('warn')
  })

  it('denies when nobody answers in time', async () => {
    const result = approvals.ask('default', 'Bash', { command: 'x' })
    vi.advanceTimersByTime(APPROVAL_TIMEOUT_MS)
    await expect(result).resolves.toBe(false)
    expect(sent.at(-1)).toMatchObject({ type: 'approval_end' })
  })

  it('answers the newest card of a workspace by voice', async () => {
    expect(approvals.has('default')).toBe(false)
    const first = approvals.ask('default', 'Bash', { command: 'a' })
    const second = approvals.ask('default', 'Bash', { command: 'b' })
    expect(approvals.has('default')).toBe(true)
    approvals.answerLatest('default', true)
    await expect(second).resolves.toBe(true)
    approvals.answerLatest('default', false)
    await expect(first).resolves.toBe(false)
    expect(approvals.has('default')).toBe(false)
  })

  it('logs every decision as a nox event', async () => {
    const result = approvals.ask('default', 'Bash', { command: 'x' })
    approvals.answer(card().id, true)
    await result
    expect(bus.recent().map((e) => e.source)).toEqual(['nox', 'nox'])
  })
})

describe('spokenAnswer', () => {
  it('understands yes and no in Portuguese', () => {
    expect(spokenAnswer('Confirma.')).toBe(true)
    expect(spokenAnswer('sim, pode fazer')).toBe(true)
    expect(spokenAnswer('não')).toBe(false)
    expect(spokenAnswer('cancela isso')).toBe(false)
  })

  it('lets a no win and leaves the unclear unanswered', () => {
    expect(spokenAnswer('pode não, cancela')).toBe(false)
    expect(spokenAnswer('que horas são')).toBeUndefined()
  })
})

describe('verdict', () => {
  it('speaks the permission prompt tool protocol', () => {
    const input = { command: 'ls' }
    expect(JSON.parse(verdict(true, input))).toEqual({ behavior: 'allow', updatedInput: input })
    expect(JSON.parse(verdict(false, input))).toMatchObject({ behavior: 'deny' })
  })
})
