// Types shared by the core, the services and the frontend.

export type ServiceState = 'online' | 'degraded' | 'offline'
export type EventLevel = 'info' | 'warn' | 'error'

export interface ServiceManifest {
  // Kebab-case and unique. Must match the service's folder name; it is also the API prefix,
  // /api/services/<id>.
  id: string
  name: string
  // Two letters on the service's card. Derived from the name when absent.
  mono?: string
  // One line under the name on the card.
  desc: string
  // What the service runs on, e.g. "docker".
  runtime?: string
  // host:port shown on the card.
  address?: string
  // Docker container name. When set, the card shows its uptime, CPU and memory.
  container?: string
  // Opens in a new tab from the card (OPEN ↗).
  url?: string
}

export interface ServiceStatus {
  state: ServiceState
  message?: string
}

// The serialisable part of a service action: what the Services window lists and NOX can call.
export interface ServiceActionInfo {
  id: string
  method: 'GET' | 'POST'
  // Shown next to the method on the card, e.g. "/farm/start". A label; actions are run through
  // POST /api/services/<id>/actions/<action id>.
  path: string
  title: string
  description: string
  mutating: boolean
  // JSON Schema of the input, if any.
  input?: Record<string, unknown>
}

// What GET /api/services returns for each service.
export interface ServiceSummary extends ServiceManifest {
  mono: string
  status: ServiceStatus
  actions: ServiceActionInfo[]
  // True when the service emits events, so the card can link to its log.
  emitsEvents: boolean
  // Described as data and changeable at runtime (by NOX), unlike a service made of code.
  managed?: boolean
}

export interface MeridianEvent {
  id: number
  // ISO timestamp.
  ts: string
  // A service id, or "nox" / "core".
  source: string
  level: EventLevel
  message: string
}

export interface TelemetrySample {
  cpu: number
  // GB in use.
  mem: number
  // Celsius; null when the host exposes no sensor.
  temp: number | null
  // MB/s over all non-loopback interfaces.
  net: number
}

export interface ContainerInfo {
  name: string
  state: string
  cpu: number
  mem: number
  uptimeSec: number
}

export interface HostInfo {
  name: string
  memTotalGb: number
}

// Messages on the WebSocket at /api/stream.
export type StreamMessage =
  | { type: 'snapshot'; host: HostInfo; services: ServiceSummary[]; events: MeridianEvent[]; telemetry: TelemetrySample[]; containers: ContainerInfo[] }
  | { type: 'event'; event: MeridianEvent }
  | { type: 'services'; services: ServiceSummary[] }
  | { type: 'telemetry'; sample: TelemetrySample; containers: ContainerInfo[] }
  | { type: 'agent'; mode: AgentMode }
  // The background tasks running for the workspace this screen shows, whenever they change.
  | { type: 'tasks'; tasks: { id: string; title: string }[] }
  // One spoken sentence of a NOX answer, as base64 mp3; `seq` orders them within a turn.
  | { type: 'speech'; turn: number; seq: number; mime: 'audio/mpeg'; audio: string }
  | { type: 'speech_end'; turn: number }
  | { type: 'command'; command: ScreenCommand }
  // NOX wants to do something that needs the owner's yes; the card stays until the matching approval_end.
  | { type: 'approval'; id: string; tool: string; detail: string }
  | { type: 'approval_end'; id: string }
  // Sent for the workspace the client asked to watch, on connect and on every change.
  | { type: 'workspace'; id: string; version: number; state: unknown }

// Messages a client sends on the same socket.
export type ClientMessage =
  | { type: 'watch'; workspace: string }
  // The screen finished playing a turn's speech.
  | { type: 'speech_done'; turn: number }
  | { type: 'approval_answer'; id: string; allow: boolean }
  // The owner cut NOX off: stop the turn that is running and whatever it is still saying.
  | { type: 'interrupt' }

export interface WorkspaceSummary {
  id: string
  name: string
  version: number
  updatedAt: string
}

// A workspace's state is the web app's business (windows, dock, theme...); the server stores it as JSON.
export interface Workspace extends WorkspaceSummary {
  state: unknown
}

export type AgentMode = 'boot' | 'idle' | 'listening' | 'thinking' | 'speaking'
export type ThemeMode = 'auto' | 'light' | 'dark'
export type PaletteId = 'mono' | 'blue' | 'meridian'

export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'fg' | 'dim'

// The design's block language: NOX answers with a document made of these.
export type DocBlock =
  | { t: 'h'; level?: 1 | 2; text: string; eyebrow?: string }
  | { t: 'p'; text: string }
  | { t: 'stats'; items: { label: string; value: string | number; unit?: string; note?: string; tone?: Tone }[] }
  | { t: 'progress'; items: { label: string; value: number; detail?: string; tone?: Tone }[] }
  | { t: 'table'; cols: { label: string; align?: 'left' | 'right'; w?: string }[]; rows: (string | { v: string; tone?: Tone })[][] }
  | { t: 'list'; items: { text: string; meta?: string; state?: 'done' | 'active' | 'todo' }[] }
  | { t: 'callout'; tone?: Tone; title?: string; text: string }
  | { t: 'kv'; items: { k: string; v: string; tone?: Tone }[] }
  | { t: 'code'; lang?: string; text: string }
  | { t: 'tags'; items: { label: string; tone?: Tone }[] }
  | { t: 'divider' }

// A widget bound to a read-only service action: every `everySec` seconds the action runs and its result
// fills the template (see renderTemplate), so the widget keeps updating after a reload.
export interface LiveWidgetSpec {
  title: string
  kicker: string
  service: string
  action: string
  params?: Record<string, unknown>
  everySec: number
  template: DocBlock[]
}

export interface DocSpec {
  // A document with an id is live: composing it again with the same id updates it in place.
  id?: string
  title: string
  kicker: string
  blocks: DocBlock[]
}

// What the server asks a screen to do. The screen runs its own window manager and dock, and the
// resulting layout reaches every other screen through the workspace.
export type ScreenCommand =
  | { name: 'open_window'; window: string }
  | { name: 'close_window'; window: string }
  | { name: 'close_all' }
  | { name: 'arrange' }
  // Shows the pin card for the widget a window would dock (the user drops it on a rail).
  | { name: 'pin_widget'; window: string }
  | { name: 'clear_agent_widgets' }
  | { name: 'set_theme'; mode?: ThemeMode; palette?: PaletteId }
  | { name: 'compose_doc'; doc: DocSpec }
  // Offers a widget that redraws itself from a service action (the user drops it on a rail).
  | { name: 'pin_live_widget'; widget: LiveWidgetSpec }

export { renderTemplate } from './template.js'
