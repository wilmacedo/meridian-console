import type { DeviceStore } from './store.js'

export interface Closable {
  close: (code?: number, reason?: string) => void
}

const KEY = 'kill_switch'

// Persisted, so a server restart does not quietly hand the devices their power back.
export class KillSwitch {
  private readonly sockets = new Set<Closable>()
  private readonly listeners: (() => void)[] = []

  constructor(private readonly store: DeviceStore) {}

  engaged(): boolean {
    return this.store.getState(KEY) === 'on'
  }

  // A socket that arrives while the switch is on is closed on the spot and never tracked.
  admit(socket: Closable): boolean {
    if (this.engaged()) {
      socket.close(1008, 'kill switch')
      return false
    }
    this.sockets.add(socket)
    return true
  }

  release(socket: Closable): void {
    this.sockets.delete(socket)
  }

  // For what is not a socket, such as a tunnel: told every time the switch is thrown.
  onEngage(listener: () => void): void {
    this.listeners.push(listener)
  }

  engage(): number {
    this.store.setState(KEY, 'on')
    const closed = this.sockets.size
    for (const socket of this.sockets) socket.close(1008, 'kill switch')
    this.sockets.clear()
    for (const listener of this.listeners) listener()
    return closed
  }

  resume(): void {
    this.store.setState(KEY, 'off')
  }
}
