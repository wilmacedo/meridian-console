// The line under the core in the car layout: what a tap on it does right now.
export interface CarHintInput {
  mode: 'boot' | 'idle' | 'listening' | 'thinking' | 'working' | 'speaking'
  // Whole seconds the microphone has been open.
  listenedSeconds: number
  // The owner just stopped NOX.
  halted: boolean
  // NOX has something running that a tap stops.
  busy: boolean
  // The owner just dropped a recording.
  cancelled?: boolean
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function carHint({ mode, listenedSeconds, halted, busy, cancelled }: CarHintInput): string {
  if (mode === 'listening') return `${pad(Math.floor(listenedSeconds / 60))}:${pad(listenedSeconds % 60)} · TAP TO SEND`
  if (cancelled && mode === 'idle') return 'CANCELLED · NOTHING SENT'
  if (mode === 'thinking') return 'SENDING · TAP TO STOP'
  if (halted) return 'NOX HALTED'
  if (mode === 'boot') return 'BOOTING'
  if (busy) return 'TAP TO STOP NOX'
  return 'TAP TO TALK'
}
