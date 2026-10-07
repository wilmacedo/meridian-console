import type { Workspace } from '@meridian/service-sdk'
import { restoreDock, snapshotDock, type PersistedWidget } from '../dock/dock.svelte'
import type { RailId } from '../dock/widgets'
import type { DocSpec } from '../docs/doc-blocks'
import { docs, restoreDoc } from '../docs/docs.svelte'
import type { PaletteId, ThemeMode } from '../theme/palettes'
import { theme } from '../theme/theme.svelte'
import { restoreWindows, snapshotWindows, type PersistedWindow } from '../windows/window-manager.svelte'
import { prefs } from './prefs.svelte'

// Writes are debounced so a drag doesn't send a request per pointer move.
const WRITE_DEBOUNCE_MS = 400
const DEVICE_KEY = 'meridian.workspace'
const DEFAULT_ID = 'default'

// Specs, not rendered output: a feeder widget is stored as its type and re-renders with live data.
interface WorkspaceState {
  theme?: { mode: ThemeMode; palette: PaletteId }
  windows?: { list: PersistedWindow[]; custom: boolean; active: string }
  dock?: { rails: Record<RailId, string[]>; widgets: Record<string, PersistedWidget> }
  doc?: DocSpec | null
  hiddenServices?: string[]
  hiddenModules?: string[]
}

function snapshot(): WorkspaceState {
  return {
    theme: { mode: theme.mode, palette: theme.palette },
    windows: snapshotWindows(),
    dock: snapshotDock(),
    doc: docs.current ? ($state.snapshot(docs.current) as DocSpec) : null,
    hiddenServices: [...prefs.hiddenServices],
    hiddenModules: [...prefs.hiddenModules],
  }
}

// Missing parts of a stored state (a fresh workspace has none) fall back to the defaults.
function restore(state: WorkspaceState): void {
  theme.mode = state.theme?.mode ?? 'auto'
  theme.palette = state.theme?.palette ?? 'mono'
  restoreWindows(state.windows?.list ?? [], state.windows?.custom ?? false, state.windows?.active ?? 'core')
  if (state.dock) restoreDock(state.dock.rails, state.dock.widgets)
  restoreDoc(state.doc ?? null)
  prefs.hiddenServices = state.hiddenServices ?? []
  prefs.hiddenModules = state.hiddenModules ?? []
}

// Which workspace this device opens is a device preference, not workspace state.
export function deviceWorkspaceId(): string {
  const requested = new URLSearchParams(location.search).get('workspace')
  if (requested) localStorage.setItem(DEVICE_KEY, requested)
  return requested ?? localStorage.getItem(DEVICE_KEY) ?? DEFAULT_ID
}

let id = DEFAULT_ID

// The workspace this screen shows.
export const workspaceId = (): string => id
let version = 0
// The serialised state the server is known to hold (or is about to), so unchanged state is never sent.
let known = ''
let timer: ReturnType<typeof setTimeout> | undefined
let inflight = false
let again = false

function adopt(workspace: { version: number; state: unknown }): void {
  restore(workspace.state as WorkspaceState)
  known = JSON.stringify(snapshot())
  version = workspace.version
}

export async function loadWorkspace(workspaceId: string): Promise<string> {
  id = workspaceId
  try {
    let res = await fetch(`/api/workspaces/${id}`)
    if (res.status === 404 && id !== DEFAULT_ID) {
      id = DEFAULT_ID
      res = await fetch(`/api/workspaces/${id}`)
    }
    if (res.ok) adopt((await res.json()) as Workspace)
  } catch {
    // Server unreachable: start from the defaults; the stream reconnects and a later write reconciles.
  }
  return id
}

// A change made elsewhere (another screen, NOX). Our own writes come back too, at a version we already hold.
export function receiveWorkspace(incoming: number, state: unknown): void {
  if (incoming > version) adopt({ version: incoming, state })
}

async function flush(): Promise<void> {
  if (inflight) {
    again = true
    return
  }
  const json = JSON.stringify(snapshot())
  if (json === known) return
  inflight = true
  try {
    const res = await fetch(`/api/workspaces/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, state: JSON.parse(json) }) })
    if (res.ok) {
      version = ((await res.json()) as { version: number }).version
      known = json
    } else if (res.status === 409) {
      // Someone else wrote first: their state wins, and ours is dropped.
      adopt((await res.json()) as Workspace)
    }
  } catch {
    // Offline: the change stays local and goes out with the next one.
  }
  inflight = false
  if (again) {
    again = false
    void flush()
  }
}

// Watches every part of the workspace and sends it to the server whenever it changes.
export function startWorkspaceSync(): () => void {
  const stop = $effect.root(() => {
    $effect(() => {
      const json = JSON.stringify(snapshot())
      if (json === known) return
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), WRITE_DEBOUNCE_MS)
    })
  })
  return () => {
    stop()
    clearTimeout(timer)
  }
}

