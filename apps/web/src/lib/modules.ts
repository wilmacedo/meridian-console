export type ModuleId = 'core' | 'services' | 'telemetry' | 'logs' | 'cameras' | 'calendar'

export interface ModuleDef {
  id: ModuleId
  label: string
}

// Order matters: it is the dock order and the 1-9 shortcut order.
export const MODULES: readonly ModuleDef[] = [
  { id: 'core', label: 'Core' },
  { id: 'services', label: 'Services' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'logs', label: 'Events' },
  { id: 'cameras', label: 'Cameras' },
  { id: 'calendar', label: 'Calendar' },
]
