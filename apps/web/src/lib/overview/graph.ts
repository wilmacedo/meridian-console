import type { ServiceState, ServiceSummary } from '@meridian/service-sdk'

type InfraGlyph = 'server' | 'disk' | 'globe'

const GRAPH_WIDTH = 820
const GRAPH_HEIGHT = 420

interface Point {
  x: number
  y: number
}

export interface GraphLink {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
  opacity: number
}

export interface GraphNode {
  id: string
  kind: 'infra' | 'service'
  name: string
  tip: string
  leftPct: number
  topPct: number
  size: number
  color: string
  selected: boolean
  clickable: boolean
  glyph?: InfraGlyph
  isEdge?: boolean
}

export interface TravellingPacket {
  color: string
  path: string
  duration: number
  delay: number
}

// Auto-layout from docs/design-handoff.md#screen-1--system-overview: six services per ring,
// fanned to the right of the hub, so adding a service never needs manual positioning.
function serviceLayout(index: number): Point {
  const ring = Math.floor(index / 6)
  const k = index % 6
  const perRing = 6
  const r = 152 + ring * 54
  const spread = 156 - ring * 46
  const angle = (k / (perRing - 1) - 0.5) * spread * (Math.PI / 180)
  return { x: hub.x + Math.cos(angle) * r * 0.92, y: hub.y + Math.sin(angle) * r }
}

const hub = { x: 500, y: 210 }
const wan = { id: 'wan', name: 'wan-uplink', x: 150, y: 72 }
const HOST_COLUMN_X = 250
const HOST_TOP = 130
const HOST_BOTTOM = 340

interface HostNode {
  id: string
  name: string
  x: number
  y: number
  hosted: number
}

// Hosts come from the services' manifests, stacked in a column in order of first appearance.
function hostNodes(services: ServiceSummary[]): HostNode[] {
  const hosts = [...new Set(services.map((sv) => sv.host))]
  return hosts.map((host, i) => ({
    id: host,
    name: host,
    x: HOST_COLUMN_X,
    y: hosts.length === 1 ? hub.y : HOST_TOP + (i * (HOST_BOTTOM - HOST_TOP)) / (hosts.length - 1),
    hosted: services.filter((sv) => sv.host === host).length,
  }))
}

const servicePositions = (services: ServiceSummary[]) => new Map(services.map((sv, i) => [sv.id, serviceLayout(i)]))

function toPercent(point: Point) {
  return { leftPct: (point.x / GRAPH_WIDTH) * 100, topPct: (point.y / GRAPH_HEIGHT) * 100 }
}

export function stateColor(state: ServiceState, teal: string, amber: string): string {
  if (state === 'err') return '#e0705f'
  if (state === 'warn') return amber
  return teal
}

export function buildGraphNodes(services: ServiceSummary[], selectedServiceId: string, teal: string, amber: string): GraphNode[] {
  const wanNode: GraphNode = {
    id: wan.id,
    kind: 'infra',
    name: wan.name,
    tip: wan.name,
    ...toPercent(wan),
    size: 34,
    color: amber,
    selected: false,
    clickable: false,
    glyph: 'globe',
    isEdge: true,
  }

  const hosts: GraphNode[] = hostNodes(services).map((node) => ({
    id: node.id,
    kind: 'infra',
    name: node.name,
    tip: `${node.name} · ${node.hosted} ${node.hosted === 1 ? 'service' : 'services'}`,
    ...toPercent(node),
    size: 40,
    color: teal,
    selected: false,
    clickable: true,
    glyph: 'server',
  }))

  const positions = servicePositions(services)
  const svc: GraphNode[] = services.map((sv) => ({
    id: sv.id,
    kind: 'service',
    name: sv.name,
    tip: `${sv.name} · ${sv.host}`,
    ...toPercent(positions.get(sv.id)!),
    size: 30,
    color: stateColor(sv.status.state, teal, amber),
    selected: sv.id === selectedServiceId,
    clickable: true,
  }))

  return [wanNode, ...hosts, ...svc]
}

export function buildLinks(services: ServiceSummary[], teal: string, amber: string): GraphLink[] {
  const hosts = hostNodes(services)
  const infra: GraphLink[] = []
  const link = (from: Point, to: Point, color: string, dim: boolean) =>
    infra.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, color, width: dim ? 1 : 1.1, opacity: dim ? 0.35 : 0.6 })

  if (hosts[0]) link(wan, hosts[0], amber, false)
  hosts.forEach((host, i) => {
    const next = hosts[i + 1]
    if (next) link(host, next, teal, false)
  })
  hosts.forEach((host) => link(host, hub, teal, true))

  const positions = servicePositions(services)
  const svc = services.map((sv) => {
    const to = positions.get(sv.id)!
    return { x1: hub.x, y1: hub.y, x2: to.x, y2: to.y, color: stateColor(sv.status.state, teal, amber), width: 1, opacity: 0.35 }
  })

  return [...infra, ...svc]
}

export function buildTravellingPackets(links: GraphLink[]): TravellingPacket[] {
  const picks = [links[0], links[4], links[7], links[10] ?? links[8]].filter((l): l is GraphLink => Boolean(l))
  return picks.map((link, i) => ({
    color: link.color,
    path: `path('M ${Math.round(link.x1)} ${Math.round(link.y1)} L ${Math.round(link.x2)} ${Math.round(link.y2)}')`,
    duration: 3 + i * 0.6,
    delay: i * 0.5,
  }))
}
