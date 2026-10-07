import type { AgentMode } from '@meridian/service-sdk'

export type { AgentMode }

// The orb and the header read this; voice and the NOX bridge will write it.
export const agent = $state({
  mode: 'boot' as AgentMode,
  // 0-1 level of the audio NOX is speaking / the user's microphone.
  amplitude: 0,
  micLevel: 0,
})

const kickListeners = new Set<(strength: number) => void>()

// One-shot pulse for the orb (window opened, widget docked, speech started...).
export function kick(strength: number): void {
  for (const listener of kickListeners) listener(strength)
}

export function onKick(listener: (strength: number) => void): () => void {
  kickListeners.add(listener)
  return () => kickListeners.delete(listener)
}

export function startListening(): void {
  if (agent.mode === 'listening') return
  agent.mode = 'listening'
}

// The orb rises over ~2.6s on load; leave BOOTING once it has.
export function finishBoot(): void {
  setTimeout(() => {
    if (agent.mode === 'boot') agent.mode = 'idle'
  }, 2800)
}

if (import.meta.env.DEV) Object.assign(window, { noxAgent: agent })
