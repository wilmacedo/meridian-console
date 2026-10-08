import { clearApprovals, hideApproval, showApproval } from '../agent/approval.svelte'
import { play } from '../sound/sfx.svelte'
import { agent } from '../agent/agent-state.svelte'
import { taskProgress } from '../agent/task-progress'
import { enqueueSpeech, endSpeech, player } from '../voice/voice-player.svelte'
import type { ClientMessage, ContainerInfo, ScreenCommand, HostInfo, MeridianEvent, ServiceSummary, StreamMessage, TaskView, TelemetrySample } from '@meridian/service-sdk'

// The events window keeps the 120 most recent.
const EVENT_BUFFER = 120
const SAMPLE_BUFFER = 48
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 10_000
// The server writes a telemetry sample every second; a connection that says nothing for this long is
// dead even if the browser hasn't noticed (a sleeping laptop, a Wi-Fi drop).
const SILENCE_LIMIT_MS = 10_000
const WATCHDOG_MS = 2000

// Everything the server pushes. The UI renders only this: there is no fake data anywhere.
export const live = $state({
  // 'connecting' until the first attempt settles, so a page that is just loading doesn't flash as offline.
  link: 'connecting' as 'connecting' | 'online' | 'offline',
  host: { name: '', memTotalGb: 0 } as HostInfo,
  services: [] as ServiceSummary[],
  // Newest first.
  events: [] as MeridianEvent[],
  telemetry: [] as TelemetrySample[],
  containers: [] as ContainerInfo[],
  // Background tasks NOX is running for this workspace.
  tasks: [] as TaskView[],
})

function apply(message: StreamMessage): void {
  switch (message.type) {
    case 'agent':
      // The orb is still rising on load; BOOTING ends on its own schedule.
      if (agent.mode === 'boot' && message.mode === 'idle') break
      // The turn the owner just cut off reports idle a moment after the mic has already started listening.
      if (agent.mode === 'listening' && message.mode === 'idle') break
      agent.mode = message.mode
      // With voice, the player drives the level from the audio it plays; without it, speaking uses a
      // steady one so the orb still moves.
      if (message.mode !== 'speaking') agent.amplitude = 0
      else if (!player.active) agent.amplitude = 0.55
      break
    case 'tasks':
      // One that is gone from the list has finished (or was stopped): nothing else tells the owner it is done.
      if (live.tasks.some((t) => !message.tasks.some((n) => n.id === t.id))) play('task-done')
      live.tasks = message.tasks
      agent.working = message.tasks.length > 0
      // Empty: the ring fills as it fades, so a finished task reads as complete.
      agent.workProgress = message.tasks.length ? taskProgress(message.tasks.at(-1)!.steps) : 1
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

// Names this tab to the server, so what NOX says and does for a request made here is shown here and not
// on whichever tab connected last. Not crypto.randomUUID: that needs HTTPS, and the page may be on plain http.
export const screenId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

let current: WebSocket | undefined

// The microphone registers here (it imports this module, so this one cannot import it).
let wakeVerdict: ((granted: boolean) => void) | undefined

export const onWakeVerdict = (fn: (granted: boolean) => void): void => void (wakeVerdict = fn)

export function sendToServer(message: ClientMessage): void {
  if (current?.readyState === WebSocket.OPEN) current.send(JSON.stringify(message))
}

// The workspace this screen is watching, which a switch in place changes without reconnecting.
let watched = ''

export function watchWorkspace(workspaceId: string): void {
  watched = workspaceId
  // Another workspace's tasks are not this one's.
  live.tasks = []
  agent.working = false
  sendToServer({ type: 'watch', workspace: workspaceId, screen: screenId })
}

export function startStream(workspaceId: string, { onWorkspace, onCommand }: Handlers): () => void {
  watched = workspaceId
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = RECONNECT_MIN_MS
  let stopped = false
  let lastHeard = Date.now()
  // Another workspace's tasks leaving the list are not this one's finishing.
  live.tasks = []
  agent.working = false

  function connect(): void {
    lastHeard = Date.now()
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/stream`
    socket = new WebSocket(url)
    current = socket
    socket.onopen = () => {
      live.link = 'online'
      delay = RECONNECT_MIN_MS
      socket?.send(JSON.stringify({ type: 'watch', workspace: watched, screen: screenId } satisfies ClientMessage))
    }
    socket.onmessage = (e) => {
      lastHeard = Date.now()
      const message = JSON.parse(e.data as string) as StreamMessage
      if (message.type === 'workspace') onWorkspace(message.version, message.state)
      else if (message.type === 'command') onCommand(message.command)
      else if (message.type === 'speech') void enqueueSpeech(message.turn, message.seq, message.audio)
      else if (message.type === 'speech_end') endSpeech(message.turn)
      else if (message.type === 'approval') showApproval({ id: message.id, tool: message.tool, detail: message.detail })
      else if (message.type === 'approval_end') hideApproval(message.id)
      else if (message.type === 'wake_verdict') wakeVerdict?.(message.granted)
      else apply(message)
    }
    const mine = socket
    socket.onclose = () => {
      if (socket === mine) lost()
    }
  }

  // The connection is gone, however we found out: show it and try again, backing off.
  function lost(): void {
    live.link = 'offline'
    // A card nobody answers is denied by the server after a minute.
    clearApprovals()
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(connect, delay)
    delay = Math.min(delay * 2, RECONNECT_MAX_MS)
  }

  // Coming back online or to the tab, there is no reason to wait out the backoff.
  function retryNow(): void {
    if (stopped || document.hidden || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    clearTimeout(timer)
    delay = RECONNECT_MIN_MS
    connect()
  }
  const watchdog = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN || Date.now() - lastHeard <= SILENCE_LIMIT_MS) return
    // Closing a dead connection waits for a handshake that never comes, so it is let go of, not waited on.
    const dead = socket
    dead.onclose = null
    dead.onmessage = null
    dead.close()
    lost()
  }, WATCHDOG_MS)
  window.addEventListener('online', retryNow)
  document.addEventListener('visibilitychange', retryNow)

  connect()
  return () => {
    stopped = true
    clearTimeout(timer)
    clearInterval(watchdog)
    window.removeEventListener('online', retryNow)
    document.removeEventListener('visibilitychange', retryNow)
    socket?.close()
  }
}

if (import.meta.env.DEV) Object.assign(window, { noxLive: live })
