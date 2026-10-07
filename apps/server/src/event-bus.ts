import type { EventLevel, MeridianEvent } from '@meridian/service-sdk'

type Listener = (event: MeridianEvent) => void

// The single event stream: services emit into it, the core adds its own (status changes, NOX's
// actions), and every connected screen reads from it. Only the most recent events are kept.
export class EventBus {
  private events: MeridianEvent[] = []
  private nextId = 1
  private listeners = new Set<Listener>()

  constructor(private capacity = 500) {}

  emit(source: string, level: EventLevel, message: string): MeridianEvent {
    const event: MeridianEvent = { id: this.nextId++, ts: new Date().toISOString(), source, level, message }
    this.events.push(event)
    if (this.events.length > this.capacity) this.events.shift()
    for (const listener of this.listeners) listener(event)
    return event
  }

  // Oldest first.
  recent(): MeridianEvent[] {
    return [...this.events]
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
