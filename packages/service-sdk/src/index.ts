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
  // Sent for the workspace the client asked to watch, on connect and on every change.
  | { type: 'workspace'; id: string; version: number; state: unknown }

// Messages a client sends on the same socket.
export type ClientMessage = { type: 'watch'; workspace: string }

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
