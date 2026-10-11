import { EventEmitter } from 'node:events'
import type { Socket } from './gateway.js'

// Stands in for the extension: speaks the protocol from its side of the socket.
export class FakeExtension extends EventEmitter {
  sent: Record<string, unknown>[] = []
  closed?: { code?: number; reason?: string }
  readonly socket: Socket = {
    send: (data) => {
      const frame = JSON.parse(data) as Record<string, unknown>
      this.sent.push(frame)
      this.emit('frame', frame)
    },
    close: (code, reason) => {
      this.closed = { code, reason }
      queueMicrotask(() => this.emit('close'))
    },
    on: ((event: string, cb: never) => this.on(event, cb as (...a: unknown[]) => void)) as Socket['on'],
  }
  say(frame: unknown): void {
    this.emit('message', JSON.stringify(frame))
  }
  hello(label = 'personal', over: Record<string, unknown> = {}): void {
    this.say({ id: 'hs-1', method: 'system.handshake', params: { client: 'browser-skill-extension', version: '0.1.0', protocol_version: '1.3', instance_id: 'i', browser: { name: 'chrome', version: '154' }, label, min_compatible_protocol: '1.0', ...over } })
  }
}
