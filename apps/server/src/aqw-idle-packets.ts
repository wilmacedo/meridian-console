import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'

// Single consumer for now (aqw-idle's packet console) — see docs/architecture.md's data flow
// table. Not a generic multi-service log-tailing abstraction; revisit if a second service needs
// the same pattern.
const SOURCE_URL = process.env.AQW_IDLE_PRESENCE_URL ?? 'http://localhost:8787'

// A client that drops without a clean WS close (tab killed, laptop sleeps, network drops) leaves
// the TCP socket looking `ESTABLISHED` on our end with no 'close' event ever firing — its upstream
// SSE relay then runs forever, so every future packet gets forwarded once per zombie on top of the
// real client, which is why the same message could be seen arriving multiple times. Standard `ws`
// ping/pong heartbeat: terminate() any socket that hasn't ponged since the last check.
const HEARTBEAT_MS = 30_000

export function registerAqwIdlePacketStream(app: FastifyInstance): void {
  app.get('/ws/services/aqw-idle/packets', { websocket: true }, (socket) => {
    const controller = new AbortController()

    let alive = true
    socket.on('pong', () => {
      alive = true
    })
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate()
        return
      }
      alive = false
      socket.ping()
    }, HEARTBEAT_MS)

    socket.on('close', () => {
      clearInterval(heartbeat)
      controller.abort()
    })

    relayPackets(socket, controller.signal).catch((err) => {
      if (controller.signal.aborted) return
      app.log.error(err, 'aqw-idle packet relay failed')
      socket.close()
    })
  })
}

// Tails aqw-idle-presence's SSE endpoint and forwards each `data:` line as-is — the frontend
// already knows how to parse the { raw, direction, t } envelope. One SSE connection per WS
// client keeps this simple; aqw-idle-presence itself already handles multiple subscribers.
async function relayPackets(socket: WebSocket, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${SOURCE_URL}/packets`, { signal })
  if (!res.ok || !res.body) {
    throw new Error(`aqw-idle-presence /packets responded ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const line = event.split('\n').find((l) => l.startsWith('data: '))
      if (line) socket.send(line.slice('data: '.length))
    }
  }

  // Source closed its side of the SSE connection — nothing more to relay,
  // so close the client socket rather than leaving it open and silent.
  socket.close()
}
