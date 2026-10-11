import type { PhraseTrigger, Routine } from './routines.js'

// How a routine's activation phrase is told apart in what the owner said. The owner does not repeat a phrase
// word for word, so this is only a hint for NOX, who decides; it never starts a routine by itself.

// A phrase is heard inside a request only when the request is short, so "bom dia" opens a routine but
// "bom dia, abre a telemetria e reinicia o baixa" does not.
const EXTRA_WORDS = 4

export const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export function heardIn(heard: string, phrase: string): boolean {
  const h = normalize(heard)
  const p = normalize(phrase)
  return p !== '' && ` ${h} `.includes(` ${p} `) && h.split(' ').length <= p.split(' ').length + EXTRA_WORDS
}

// Local clock, as the owner reads it: "HH:MM" and "YYYY-MM-DD" in this machine's time zone.
export const clockOf = (d: Date): string => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
export const dayOf = (d: Date): string => d.toLocaleDateString('sv-SE')

// A window that ends before it starts runs across midnight.
export function inWindow(window: PhraseTrigger['window'], now: Date): boolean {
  if (!window) return true
  const t = clockOf(now)
  return window.from <= window.to ? t >= window.from && t < window.to : t >= window.from || t < window.to
}

const phraseTriggers = (r: Routine): PhraseTrigger[] => r.triggers.filter((t) => t.kind === 'phrase')

// Whether a routine started by its phrase runs at once or NOX asks first: the owner decided it runs at once,
// unless the phrase comes outside its window or the routine already ran today.
export function phraseVerdict(routine: Routine, lastStart: number | undefined, now: Date): { go: true } | { go: false; why: string } {
  const triggers = phraseTriggers(routine)
  if (!triggers.some((t) => inWindow(t.window, now))) {
    const windows = triggers.flatMap((t) => (t.window ? [`${t.window.from}–${t.window.to}`] : []))
    return { go: false, why: `it is ${clockOf(now)}, outside its time window (${windows.join(', ')})` }
  }
  if (lastStart !== undefined && dayOf(new Date(lastStart)) === dayOf(now)) return { go: false, why: `it already ran today at ${clockOf(new Date(lastStart))}` }
  return { go: true }
}

// What NOX is told before the owner's words when they sound like a routine's phrase.
export function routineHint(heard: string, routines: Routine[], lastStart: (id: string) => number | undefined, now: Date): string | undefined {
  const routine = routines.find((r) => phraseTriggers(r).some((t) => t.phrases.some((p) => heardIn(heard, p))))
  if (!routine) return undefined
  const verdict = phraseVerdict(routine, lastStart(routine.id), now)
  return `[The owner may have said the activation phrase of the routine "${routine.name}" (${routine.id}). ${verdict.go ? 'If so, run it now with run_routine.' : `Ask before running it: ${verdict.why}.`}]`
}

// The moment NOX hears something, so "amanhã às dez" or "sexta" becomes a date: its process lives for days and its
// prompt carries no clock.
export function clockNote(now: Date): string {
  const offset = -now.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const hhmm = `${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`
  return `[It is ${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${dayOf(now)} ${clockOf(now)} (UTC${sign}${hhmm}).]`
}
