import { agent } from '../agent/agent-state.svelte'
import { enqueueSpeech, endSpeech, player } from '../voice/voice-player.svelte'
import type { ClientMessage, ContainerInfo, ScreenCommand, HostInfo, MeridianEvent, ServiceSummary, StreamMessage, TelemetrySample } from '@meridian/service-sdk'

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
    case 'agent':
      // The orb is still rising on load; BOOTING ends on its own schedule.
      if (agent.mode === 'boot' && message.mode === 'idle') break
      agent.mode = message.mode
      // With voice, the player drives the level from the audio it plays; without it, speaking uses a
      // steady one so the orb still moves.
      if (message.mode !== 'speaking') agent.amplitude = 0
      else if (!player.active) agent.amplitude = 0.55
      break
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

interface Handlers {
  // The state of the workspace this screen shows, on connect and when it changes.
  onWorkspace: (version: number, state: unknown) => void
  // Something NOX asked this screen to do.
  onCommand: (command: ScreenCommand) => void
}

let current: WebSocket | undefined

export function sendToServer(message: ClientMessage): void {
  if (current?.readyState === WebSocket.OPEN) current.send(JSON.stringify(message))
}

export function startStream(workspaceId: string, { onWorkspace, onCommand }: Handlers): () => void {
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = RECONNECT_MIN_MS
  let stopped = false

  function connect(): void {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/stream`
    socket = new WebSocket(url)
    current = socket
    socket.onopen = () => {
      live.connected = true
      delay = RECONNECT_MIN_MS
      socket?.send(JSON.stringify({ type: 'watch', workspace: workspaceId } satisfies ClientMessage))
    }
    socket.onmessage = (e) => {
      const message = JSON.parse(e.data as string) as StreamMessage
      if (message.type === 'workspace') onWorkspace(message.version, message.state)
      else if (message.type === 'command') onCommand(message.command)
      else if (message.type === 'speech') void enqueueSpeech(message.turn, message.seq, message.audio)
      else if (message.type === 'speech_end') endSpeech(message.turn)
      else apply(message)
    }
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
