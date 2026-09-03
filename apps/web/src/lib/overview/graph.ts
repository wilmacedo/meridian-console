import { hub, infraLinks, infraNodes, type InfraGlyph } from '../data/infra'
import { services, type ServiceState } from '../data/services'

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
  isPacketKind?: boolean
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

const servicePositions = new Map(services.map((sv, i) => [sv.id, serviceLayout(i)]))

function toPercent(point: Point) {
  return { leftPct: (point.x / GRAPH_WIDTH) * 100, topPct: (point.y / GRAPH_HEIGHT) * 100 }
}

export function stateColor(state: ServiceState, teal: string, amber: string): string {
  if (state === 'err') return '#e0705f'
  if (state === 'warn') return amber
  return teal
}

export function buildGraphNodes(selectedServiceId: string, teal: string, amber: string): GraphNode[] {
  const infra: GraphNode[] = infraNodes.map((node) => {
    const hostedCount = services.filter((sv) => sv.host === node.id).length
    return {
      id: node.id,
      kind: 'infra',
      name: node.name,
      tip: hostedCount ? `${node.name} · ${hostedCount} services` : node.name,
      ...toPercent(node),
      size: node.kind === 'core' ? 40 : 34,
      color: node.kind === 'edge' ? amber : teal,
      selected: false,
      clickable: hostedCount > 0,
      glyph: node.glyph,
      isEdge: node.kind === 'edge',
    }
  })

  const svc: GraphNode[] = services.map((sv) => ({
    id: sv.id,
    kind: 'service',
    name: sv.name,
    tip: `${sv.name} · ${sv.host}`,
    ...toPercent(servicePositions.get(sv.id)!),
    size: 30,
    color: stateColor(sv.state, teal, amber),
    selected: sv.id === selectedServiceId,
    clickable: true,
    isPacketKind: sv.kind === 'packet',
  }))

  return [...infra, ...svc]
}

export function buildLinks(teal: string, amber: string): GraphLink[] {
  const placed = new Map<string, Point>(infraNodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  placed.set('hub', hub)

  const infra = infraLinks.map(([a, b]) => {
    const from = placed.get(a)!
    const to = placed.get(b)!
    const dim = b === 'hub'
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: a === 'wan' ? amber : teal, width: dim ? 1 : 1.1, opacity: dim ? 0.35 : 0.6 }
  })

  const svc = services.map((sv) => {
    const to = servicePositions.get(sv.id)!
    return { x1: hub.x, y1: hub.y, x2: to.x, y2: to.y, color: stateColor(sv.state, teal, amber), width: 1, opacity: 0.35 }
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
