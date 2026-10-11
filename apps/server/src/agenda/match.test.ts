import { describe, expect, it } from 'vitest'
import { heardIn, inWindow, phraseVerdict, routineHint } from './match.js'
import type { Routine } from './routines.js'

const at = (clock: string, day = '2026-10-12'): Date => new Date(`${day}T${clock}:00`)

const routine: Routine = {
  id: 'bom-dia',
  name: 'Bom dia',
  triggers: [{ kind: 'phrase', phrases: ['bom dia', 'vamos começar o trabalho'], window: { from: '05:00', to: '12:00' } }],
  steps: [{ id: 'x', kind: 'prompt', title: 'X', prompt: 'p' }],
  version: 1,
}

describe('heardIn', () => {
  it('finds the phrase in a short request, whatever the case, accents and punctuation', () => {
    expect(heardIn('Bom dia, NOX!', 'bom dia')).toBe(true)
    expect(heardIn('vamos comecar o trabalho', 'Vamos começar o trabalho')).toBe(true)
  })

  it('needs the whole words and a short request', () => {
    expect(heardIn('bom diazinho', 'bom dia')).toBe(false)
    expect(heardIn('bom dia, abre a telemetria e reinicia o baixa agora', 'bom dia')).toBe(false)
    expect(heardIn('abre a telemetria', 'bom dia')).toBe(false)
  })
})

describe('inWindow', () => {
  it('reads the window in local time, also across midnight', () => {
    expect(inWindow({ from: '05:00', to: '12:00' }, at('07:30'))).toBe(true)
    expect(inWindow({ from: '05:00', to: '12:00' }, at('12:00'))).toBe(false)
    expect(inWindow({ from: '22:00', to: '02:00' }, at('23:10'))).toBe(true)
    expect(inWindow({ from: '22:00', to: '02:00' }, at('01:59'))).toBe(true)
    expect(inWindow({ from: '22:00', to: '02:00' }, at('03:00'))).toBe(false)
    expect(inWindow(undefined, at('03:00'))).toBe(true)
  })
})

describe('phraseVerdict', () => {
  it('runs at once inside the window the first time in the day', () => {
    expect(phraseVerdict(routine, at('08:00', '2026-10-11').getTime(), at('07:30'))).toEqual({ go: true })
  })

  it('asks outside the window, or when it already ran today', () => {
    expect(phraseVerdict(routine, undefined, at('15:00'))).toEqual({ go: false, why: 'it is 15:00, outside its time window (05:00–12:00)' })
    expect(phraseVerdict(routine, at('07:10').getTime(), at('09:00'))).toEqual({ go: false, why: 'it already ran today at 07:10' })
  })
})

describe('routineHint', () => {
  it('tells NOX which routine the owner may have started and whether to ask first', () => {
    expect(routineHint('bom dia nox', [routine], () => undefined, at('07:30'))).toBe('[The owner may have said the activation phrase of the routine "Bom dia" (bom-dia). If so, run it now with run_routine.]')
    expect(routineHint('bom dia', [routine], () => undefined, at('15:00'))).toContain('Ask before running it: it is 15:00')
    expect(routineHint('abre a telemetria', [routine], () => undefined, at('07:30'))).toBeUndefined()
  })
})
