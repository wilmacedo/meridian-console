import type { Workspace, WorkspaceSummary } from '@meridian/service-sdk'
import { cancelPending, resetDock, restoreDock, snapshotDock, type PersistedWidget } from '../dock/dock.svelte'
import type { RailId } from '../dock/widgets'
import type { DocSpec } from '../docs/doc-blocks'
import { docs, restoreDoc } from '../docs/docs.svelte'
import { watchWorkspace } from '../live/stream.svelte'
import type { ModuleId } from '../modules'
import type { PaletteId, ThemeMode } from '../theme/palettes'
import { theme } from '../theme/theme.svelte'
import { restoreWindows, snapshotWindows, type PersistedWindow } from '../windows/window-manager.svelte'
import { layout } from './layout.svelte'
import type { LayoutMode } from './layout-mode'
import { clampStrands, sanitizeModuleOrder, STRANDS_DEFAULT } from './module-order'
import { prefs } from './prefs.svelte'
import { finishSwitchFx, sleep, startSwitchFx, switchFx } from './switch-fx.svelte'
import { workspaceCode } from './workspace-card'

// Writes are debounced so a drag doesn't send a request per pointer move.
const WRITE_DEBOUNCE_MS = 400
const DEFAULT_ID = 'default'

// Specs, not rendered output: a feeder widget is stored as its type and re-renders with live data.
interface WorkspaceState {
  theme?: { mode: ThemeMode; palette: PaletteId }
  windows?: { list: PersistedWindow[]; custom: boolean; active: string }
  dock?: { rails: Record<RailId, string[]>; widgets: Record<string, PersistedWidget> }
  doc?: DocSpec | null
  hiddenServices?: string[]
  hiddenModules?: string[]
  layout?: LayoutMode
  grid?: boolean
  strands?: number
  moduleOrder?: ModuleId[]
}

// What is on screen right now, which the stored copy trails by the write debounce.
export function snapshot(): WorkspaceState {
  return {
    theme: { mode: theme.mode, palette: theme.palette },
    windows: snapshotWindows(),
    dock: snapshotDock(),
    doc: docs.current ? ($state.snapshot(docs.current) as DocSpec) : null,
    hiddenServices: [...prefs.hiddenServices],
    hiddenModules: [...prefs.hiddenModules],
    layout: layout.mode,
    grid: prefs.grid,
    strands: prefs.strands,
    moduleOrder: [...prefs.moduleOrder],
  }
}

// Missing parts of a stored state (a fresh workspace has none) fall back to the defaults.
function restore(state: WorkspaceState): void {
  theme.mode = state.theme?.mode ?? 'auto'
  theme.palette = state.theme?.palette ?? 'meridian'
  restoreWindows(state.windows?.list ?? [], state.windows?.custom ?? false, state.windows?.active ?? 'core')
  if (state.dock) restoreDock(state.dock.rails, state.dock.widgets)
  else resetDock()
  restoreDoc(state.doc ?? null)
  prefs.hiddenServices = state.hiddenServices ?? []
  prefs.hiddenModules = state.hiddenModules ?? []
  layout.mode = state.layout ?? 'auto'
  prefs.grid = state.grid ?? true
  prefs.strands = clampStrands(state.strands ?? STRANDS_DEFAULT)
  prefs.moduleOrder = sanitizeModuleOrder(state.moduleOrder)
}

// The address decides the workspace: ?workspace=<id>, and the default one when it names none. Nothing is
// remembered between tabs, so each tab (each monitor) keeps the workspace of its own address across reloads.
export function deviceWorkspaceId(): string {
  return new URLSearchParams(location.search).get('workspace') || DEFAULT_ID
}

let id = $state(DEFAULT_ID)

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
      // An address naming a workspace that does not exist yet (?workspace=vertical) makes it, so a bookmark per
      // screen is all it takes to set one up. The server makes it once, whoever asks first.
      const created = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: id.slice(0, 60), id }) })
      if (created.ok) {
        const workspace = (await created.json()) as Workspace
        id = workspace.id
        adopt(workspace)
        return id
      }
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

// Every workspace with its stored state, in the order they were made (the switcher's order).
export const workspaces = $state({ list: [] as Workspace[] })

export async function refreshWorkspaces(): Promise<void> {
  try {
    const res = await fetch('/api/workspaces?state=1')
    if (res.ok) workspaces.list = (await res.json()) as Workspace[]
  } catch {
    // Offline: the switcher keeps what it had.
  }
}

// The workspace this screen shows, as the switcher lists it.
export const currentIndex = (): number => Math.max(0, workspaces.list.findIndex((w) => w.id === id))
export const currentWorkspace = (): Workspace | undefined => workspaces.list.find((w) => w.id === id)

// What is on screen is sent now, not after the debounce, and the request has landed when this returns.
async function settle(): Promise<void> {
  clearTimeout(timer)
  await flush()
  while (inflight) await sleep(30)
}

const OUT_MS = 270
let switching = false

// Opens another workspace in this tab without loading the page: what is on screen is saved first, the core
// blurs behind a banner, and the new workspace's layout is put in its place. The address follows, so a reload
// stays on the same workspace.
export async function switchWorkspace(target: string): Promise<void> {
  if (target === id || switching) return
  switching = true
  try {
    await settle()
    const index = workspaces.list.findIndex((w) => w.id === target)
    startSwitchFx(workspaces.list[index]?.name ?? target, workspaceCode(Math.max(0, index)))
    const [res] = await Promise.all([fetch(`/api/workspaces/${encodeURIComponent(target)}`), sleep(OUT_MS)])
    if (!res.ok) {
      switchFx.current = null
      return
    }
    cancelPending()
    id = target
    adopt((await res.json()) as Workspace)
    history.replaceState(null, '', target === DEFAULT_ID ? location.pathname : `${location.pathname}?workspace=${encodeURIComponent(target)}`)
    watchWorkspace(target)
    void finishSwitchFx()
  } catch {
    switchFx.current = null
  } finally {
    switching = false
  }
}

async function send(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}

// A new workspace with the name given, and straight onto it. Returns what is wrong when it could not be made.
export async function createWorkspace(name: string): Promise<string | undefined> {
  const res = await send('/api/workspaces', 'POST', { name: name.trim() })
  if (res.status === 409) return 'ALREADY EXISTS'
  if (!res.ok) return 'COULD NOT CREATE'
  const created = (await res.json()) as Workspace
  await refreshWorkspaces()
  await switchWorkspace(created.id)
  return undefined
}

// Changes the name shown for a workspace. Returns what is wrong when it was refused.
export async function renameWorkspace(target: string, name: string): Promise<string | undefined> {
  const res = await send(`/api/workspaces/${encodeURIComponent(target)}`, 'PATCH', { name: name.trim() })
  if (res.status === 409) return 'ALREADY EXISTS'
  if (!res.ok) return 'COULD NOT RENAME'
  await refreshWorkspaces()
  return undefined
}

// A copy of the workspace on screen, with everything in it, and straight onto the copy.
export async function duplicateWorkspace(): Promise<void> {
  await settle()
  const res = await send(`/api/workspaces/${encodeURIComponent(id)}/duplicate`, 'POST', {})
  if (!res.ok) return
  const copy = (await res.json()) as Workspace
  await refreshWorkspaces()
  await switchWorkspace(copy.id)
}

// Deletes a workspace; when it is the one on screen, the screen moves to the one before it first.
export async function deleteWorkspace(target: string): Promise<void> {
  if (workspaces.list.length < 2 || target === DEFAULT_ID) return
  if (target === id) {
    const at = workspaces.list.findIndex((w) => w.id === target)
    await switchWorkspace(workspaces.list[at > 0 ? at - 1 : 1].id)
    if (id === target) return
  }
  const res = await send(`/api/workspaces/${encodeURIComponent(target)}`, 'DELETE')
  if (res.ok) await refreshWorkspaces()
}

// Puts the workspace's own settings back as a new one has them: its theme, and nothing else of the layout.
export function resetWorkspaceSettings(): void {
  theme.mode = 'auto'
  theme.palette = 'meridian'
  prefs.hiddenServices = []
  prefs.hiddenModules = []
  prefs.grid = true
  prefs.strands = STRANDS_DEFAULT
  prefs.moduleOrder = sanitizeModuleOrder(undefined)
  layout.mode = 'auto'
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

