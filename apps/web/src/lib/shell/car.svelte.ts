import { dock } from '../dock/dock.svelte'
import { layout } from '../workspace/layout.svelte'
import { prefs } from '../workspace/prefs.svelte'
import { carLayout, type CarLayout } from './car-layout'

export const isCar = (): boolean => prefs.carplay

// The widgets shown as tiles: the left rail's first, in order.
export const carTileIds = (): string[] => [...dock.rails.L, ...dock.rails.R].filter((id) => dock.widgets[id] && !dock.widgets[id].closing)

export const carGeometry = (): CarLayout => carLayout(layout.w, layout.h, carTileIds().length)

// The room windows get on the stage: all of it above the bar.
export const carStageInsets = (g: CarLayout): { left: string; right: string; top: string; bottom: string } => ({ left: '12px', right: '12px', top: '12px', bottom: `${g.bar + 24}px` })
