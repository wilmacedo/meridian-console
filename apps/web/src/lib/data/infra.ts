export type InfraNodeKind = 'core' | 'edge'

export type InfraGlyph = 'server' | 'disk' | 'globe'

export interface InfraNode {
  id: string
  name: string
  x: number
  y: number
  kind: InfraNodeKind
  glyph: InfraGlyph
}

// Coordinates live in the 820x420 graph space from docs/design-handoff.md#service-registry-shape.
export const infraNodes: InfraNode[] = [
  { id: 'wan', name: 'wan-uplink', x: 150, y: 72, kind: 'edge', glyph: 'globe' },
  { id: 'atlas-01', name: 'atlas-01', x: 296, y: 142, kind: 'core', glyph: 'server' },
  { id: 'vega-02', name: 'vega-02', x: 206, y: 252, kind: 'core', glyph: 'server' },
  { id: 'orion-03', name: 'orion-03', x: 178, y: 358, kind: 'core', glyph: 'server' },
  { id: 'nas-vault', name: 'nas-vault', x: 306, y: 322, kind: 'core', glyph: 'disk' },
]

export const infraLinks: [string, string][] = [
  ['wan', 'atlas-01'],
  ['atlas-01', 'vega-02'],
  ['vega-02', 'orion-03'],
  ['vega-02', 'nas-vault'],
  ['atlas-01', 'hub'],
  ['vega-02', 'hub'],
  ['orion-03', 'hub'],
]

export const hub = { id: 'hub', x: 500, y: 210 }
