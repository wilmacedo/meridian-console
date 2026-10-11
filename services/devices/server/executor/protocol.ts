// Frames between the server and a device's executor (JSON text over WebSocket), protocol version 1.
//
//   executor -> hello        its public key, a fresh nonce, who it is
//   server   -> challenge    its own nonce and public key, and a signature the executor checks against the key it pinned
//   executor -> proof        its signature over both nonces and the server's key
//   server   -> pending      unknown device: held with no power until the owner approves it on screen
//   server   -> ready        known and approved
//   executor -> capabilities what it can do, each with its tier and input schema
//   server   -> call         run one capability       executor -> result  text (and maybe a PNG), or an error
//   executor -> heartbeat    every 20 s, so a silent device is noticed
export const EXECUTOR_PROTOCOL = 1

export type Tier = 'observe' | 'act' | 'irreversible'

export interface CapabilityInfo {
  name: string
  tier: Tier
  description: string
  // JSON Schema of the input object.
  input: Record<string, unknown>
}

export interface Hello {
  type: 'hello'
  protocol: number
  public_key: string
  client_nonce: string
  name: string
  os: string
  version: string
}

export interface Proof {
  type: 'proof'
  signature: string
}

export interface Capabilities {
  type: 'capabilities'
  items: CapabilityInfo[]
}

export interface CallResult {
  type: 'result'
  id: string
  ok: boolean
  text?: string
  error?: string
  image_png_base64?: string
}

export const isTier = (v: unknown): v is Tier => v === 'observe' || v === 'act' || v === 'irreversible'

export function parseCapabilities(frame: Capabilities): CapabilityInfo[] | undefined {
  if (!Array.isArray(frame.items) || frame.items.length > 200) return undefined
  const out: CapabilityInfo[] = []
  for (const c of frame.items) {
    if (typeof c?.name !== 'string' || !/^[a-z][a-z0-9_]{0,40}$/.test(c.name) || !isTier(c.tier) || typeof c.description !== 'string' || typeof c.input !== 'object' || c.input === null) return undefined
    out.push({ name: c.name, tier: c.tier, description: c.description.slice(0, 500), input: c.input })
  }
  return out
}
