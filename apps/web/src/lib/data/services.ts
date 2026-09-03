export type ServiceKind = 'packet' | 'hub' | 'bus' | 'db' | 'proxy' | 'metrics' | 'media' | 'sync' | 'vpn'

export type ServiceState = 'ok' | 'warn' | 'err'

export interface Service {
  id: string
  name: string
  image: string
  host: string
  uptime: string
  cpu: number
  state: ServiceState
  kind: ServiceKind
  tag: string
}

// Seed fixtures from docs/design-handoff.md#service-registry-shape. The service registry is the
// single source of truth: every entry here automatically gets a Services dropdown row and a
// System Overview graph node, with no manual layout.
export const services: Service[] = [
  { id: 'aqw-idle', name: 'aqw-idle', image: 'node:22-alpine', host: 'orion-03', uptime: '6d 14h', cpu: 18, state: 'ok', kind: 'packet', tag: 'SOCKET' },
  { id: 'home-assistant', name: 'home-assistant', image: 'ghcr.io/hass:2026.8', host: 'atlas-01', uptime: '41d 06h', cpu: 12, state: 'ok', kind: 'hub', tag: '214 ENT' },
  { id: 'mosquitto', name: 'mosquitto', image: 'eclipse-mosquitto:2', host: 'atlas-01', uptime: '41d 06h', cpu: 3, state: 'ok', kind: 'bus', tag: 'MQTT' },
  { id: 'postgres-16', name: 'postgres-16', image: 'postgres:16-alpine', host: 'vega-02', uptime: '28d 11h', cpu: 22, state: 'ok', kind: 'db', tag: 'SQL' },
  { id: 'caddy-edge', name: 'caddy-edge', image: 'caddy:2-alpine', host: 'vega-02', uptime: '28d 11h', cpu: 7, state: 'ok', kind: 'proxy', tag: 'INGRESS' },
  { id: 'prometheus', name: 'prometheus', image: 'prom/prometheus:2.5', host: 'vega-02', uptime: '28d 11h', cpu: 15, state: 'ok', kind: 'metrics', tag: 'TSDB' },
  { id: 'jellyfin', name: 'jellyfin', image: 'jellyfin:10.10', host: 'orion-03', uptime: '9d 02h', cpu: 48, state: 'ok', kind: 'media', tag: 'MEDIA' },
  { id: 'syncthing', name: 'syncthing', image: 'syncthing:1.29', host: 'orion-03', uptime: '3d 19h', cpu: 9, state: 'warn', kind: 'sync', tag: 'PEER' },
  { id: 'wg-gateway', name: 'wg-gateway', image: 'wireguard:latest', host: 'atlas-01', uptime: '41d 06h', cpu: 2, state: 'ok', kind: 'vpn', tag: 'TUNNEL' },
]
