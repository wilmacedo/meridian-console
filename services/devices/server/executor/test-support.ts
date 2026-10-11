import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { FakeExtension } from '../browser/test-support.js'
import { b64 } from './keys.js'
import type { CapabilityInfo } from './protocol.js'

export const CAPS: CapabilityInfo[] = [
  { name: 'window_list', tier: 'observe', description: 'List windows', input: { type: 'object', properties: {} } },
  { name: 'process_kill', tier: 'irreversible', description: 'Kill a process', input: { type: 'object', required: ['pid'], properties: { pid: { type: 'integer' } } } },
]

// Stands in for the Rust executor: a real Ed25519 key pair and the same signatures.
export class Device {
  readonly key: KeyObject
  readonly pub: string
  readonly ext = new FakeExtension()
  constructor(seed?: KeyObject) {
    this.key = seed ?? generateKeyPairSync('ed25519').privateKey
    this.pub = b64((createPublicKey(this.key).export({ format: 'der', type: 'spki' }) as Buffer).subarray(12))
  }
  get frames(): Record<string, unknown>[] {
    return this.ext.sent
  }
  last(): Record<string, unknown> {
    return this.ext.sent.at(-1)!
  }
  hello(over: Record<string, unknown> = {}): this {
    this.ext.say({ type: 'hello', protocol: 1, public_key: this.pub, client_nonce: b64(Buffer.alloc(32, 7)), name: 'win-lan', os: 'windows', version: '0.1.0', ...over })
    return this
  }
  prove(serverPub: string): this {
    const challenge = this.ext.sent.find((f) => f.type === 'challenge') as { server_nonce: string }
    const msg = Buffer.concat([Buffer.from('meridian-executor/v1/device\0'), Buffer.alloc(32, 7), Buffer.from(challenge.server_nonce, 'base64'), Buffer.from(serverPub, 'base64')])
    this.ext.say({ type: 'proof', signature: b64(sign(null, msg, this.key)) })
    return this
  }
  announce(items: unknown = CAPS): this {
    this.ext.say({ type: 'capabilities', items })
    return this
  }
}
