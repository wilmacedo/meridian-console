import type { Workspace } from '@meridian/service-sdk'

// The part of a stored workspace the switcher draws: how many things are on its rails and stage, and its theme.
interface CardState {
  dock?: { rails?: { L?: string[]; R?: string[] } }
  windows?: { list?: unknown[] }
  theme?: { mode?: string; palette?: string }
}

export interface WorkspaceCard {
  // Bars drawn in the thumbnail: up to three per rail and four windows.
  left: number
  right: number
  windows: number
  widgets: number
  meta: string
  palette: string
}

const THUMB_RAIL_MAX = 3
const THUMB_WINDOW_MAX = 4

export function workspaceCard(workspace: Pick<Workspace, 'state'>): WorkspaceCard {
  const state = (workspace.state ?? {}) as CardState
  const left = state.dock?.rails?.L?.length ?? 0
  const right = state.dock?.rails?.R?.length ?? 0
  const windows = state.windows?.list?.length ?? 0
  const widgets = left + right
  const palette = state.theme?.palette ?? 'meridian'
  const mode = state.theme?.mode ?? 'auto'
  return {
    left: Math.min(left, THUMB_RAIL_MAX),
    right: Math.min(right, THUMB_RAIL_MAX),
    windows: Math.min(windows, THUMB_WINDOW_MAX),
    widgets,
    palette,
    meta: `${widgets} ${widgets === 1 ? 'WIDGET' : 'WIDGETS'} · ${windows} WIN · ${palette.toUpperCase()}/${mode.toUpperCase()}`,
  }
}

export const workspaceCode = (index: number): string => String(index + 1).padStart(2, '0')
