import type { ContainerInfo, HostInfo, MeridianEvent, ServiceSummary, StreamMessage, TelemetrySample } from '@meridian/service-sdk'

// The events window keeps the 120 most recent.
const EVENT_BUFFER = 120
const SAMPLE_BUFFER = 48
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 10_000

// Everything the server pushes. The UI renders only this: there is no fake data anywhere.
export const live = $state({
  connected: false,
  host: { name: '', memTotalGb: 0 } as HostInfo,
  services: [] as ServiceSummary[],
  // Newest first.
  events: [] as MeridianEvent[],
  telemetry: [] as TelemetrySample[],
  containers: [] as ContainerInfo[],
})

function apply(message: StreamMessage): void {
  switch (message.type) {
    case 'snapshot':
      live.host = message.host
      live.services = message.services
      live.events = [...message.events].reverse().slice(0, EVENT_BUFFER)
      live.telemetry = message.telemetry
      live.containers = message.containers
      break
    case 'event':
      live.events = [message.event, ...live.events].slice(0, EVENT_BUFFER)
      break
    case 'services':
      live.services = message.services
      break
    case 'telemetry':
      live.telemetry = [...live.telemetry, message.sample].slice(-SAMPLE_BUFFER)
      live.containers = message.containers
      break
  }
}

export function startStream(): () => void {
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = RECONNECT_MIN_MS
  let stopped = false

  function connect(): void {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/stream`
    socket = new WebSocket(url)
    socket.onopen = () => {
      live.connected = true
      delay = RECONNECT_MIN_MS
    }
    socket.onmessage = (e) => apply(JSON.parse(e.data as string) as StreamMessage)
    socket.onclose = () => {
      live.connected = false
      if (stopped) return
      timer = setTimeout(connect, delay)
      delay = Math.min(delay * 2, RECONNECT_MAX_MS)
    }
  }

  connect()
  return () => {
    stopped = true
    clearTimeout(timer)
    socket?.close()
  }
}
