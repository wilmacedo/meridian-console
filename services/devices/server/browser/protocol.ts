// The frames and tool payloads of the BrowserSkill extension protocol, the subset this gateway speaks. Mirrors
// the pinned schemas in ./schemas (commit 63c1657, protocol 1.3); a contract test validates our frames against them.

export const PROTOCOL_VERSION = '1.3'
export const MIN_COMPATIBLE_PROTOCOL = '1.0'
export const SERVER_NAME = 'meridian-devices'
export const AUTH_SUBPROTOCOL_PREFIX = 'bsk-auth.'

export interface RpcError {
  code: string
  message: string
  data?: { reason?: string; [key: string]: unknown }
}

export interface RequestFrame {
  id: string
  method: string
  params?: unknown
}

export type ResponseFrame = { id: string; result: unknown } | { id: string; error: RpcError }

export interface EventFrame {
  event: string
  payload?: unknown
}

export type Frame = RequestFrame | ResponseFrame | EventFrame

export const isResponse = (f: Frame): f is ResponseFrame => typeof (f as ResponseFrame).id === 'string' && ('result' in f || 'error' in f)
export const isEvent = (f: Frame): f is EventFrame => typeof (f as EventFrame).event === 'string'
export const isRequest = (f: Frame): f is RequestFrame => typeof (f as RequestFrame).method === 'string'

export interface HandshakeParams {
  client: string
  version: string
  protocol_version: string
  instance_id: string
  browser: { name: string; version: string }
  label: string
  min_compatible_protocol?: string | null
}

export interface HandshakeResult {
  server: string
  version: string
  protocol_version: string
  min_compatible_protocol: string
  audit_version: number
  audit_ready: boolean
}

// "1.3" -> [1, 3]; anything else is not a version.
export function parseVersion(v: string): [number, number] | undefined {
  const m = /^(\d+)\.(\d+)/.exec(v)
  return m ? [Number(m[1]), Number(m[2])] : undefined
}

const atLeast = (a: [number, number], b: [number, number]): boolean => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])

// Same major, and each side at or above the floor the other one states.
export function protocolCompatible(peer: string, peerMin: string | null | undefined): boolean {
  const theirs = parseVersion(peer)
  const ours = parseVersion(PROTOCOL_VERSION)
  const floor = parseVersion(MIN_COMPATIBLE_PROTOCOL)
  const theirFloor = parseVersion(peerMin ?? '1.0')
  if (!theirs || !ours || !floor || !theirFloor) return false
  return theirs[0] === ours[0] && atLeast(theirs, floor) && atLeast(ours, theirFloor)
}

export interface ToolResults {
  'tool.session_start': { agent_window_id?: number | null }
  'tool.session_stop': { returned_tab_ids?: number[] }
  'tool.tab_list': { tabs: { tab_id: number; title?: string | null; url?: string | null; active?: boolean | null; scope?: string | null }[] }
  'tool.navigate': { reached: string; url: string; final_url?: string | null; error_text?: string | null; tab_id: number }
  'tool.observe': { text: string; ref_count: number; tab_id: number; next_cursor?: string | null; truncated?: boolean }
  'tool.click': { tab_id: number; x: number; y: number }
  'tool.fill': { tab_id: number; value_length: number }
  'tool.press': { tab_id: number; key: string; code: string }
  'tool.wait_for_element': { satisfied: boolean; elapsed_ms: number; tab_id: number }
  'tool.evaluate': { ok: boolean; tab_id: number; value?: unknown; error?: { text: string } | null }
}

export type ToolMethod = keyof ToolResults
