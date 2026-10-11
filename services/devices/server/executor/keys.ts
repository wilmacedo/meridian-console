import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Ed25519, with keys exchanged as the raw 32 bytes in base64: the form every library takes without a wrapper.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export const b64 = (data: Buffer): string => data.toString('base64')

export function decode(value: unknown, length: number): Buffer | undefined {
  if (typeof value !== 'string') return undefined
  const bytes = Buffer.from(value, 'base64')
  return bytes.length === length && b64(bytes) === value ? bytes : undefined
}

const publicKeyOf = (raw: Buffer): KeyObject => createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
const rawPublic = (key: KeyObject): Buffer => (key.export({ format: 'der', type: 'spki' }) as Buffer).subarray(SPKI_PREFIX.length)

// The server's own identity. Executors pin its public key, so a fake server on the network cannot give them orders.
export class ServerKey {
  private constructor(private readonly privateKey: KeyObject) {}

  static fromPrivate(pkcs8Der: Buffer): ServerKey {
    return new ServerKey(createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' }))
  }

  static loadOrCreate(file: string): ServerKey {
    if (existsSync(file)) return ServerKey.fromPrivate(Buffer.from((JSON.parse(readFileSync(file, 'utf8')) as { private: string }).private, 'base64'))
    const { privateKey } = generateKeyPairSync('ed25519')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ private: b64(privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer) }), { mode: 0o600 })
    chmodSync(file, 0o600)
    return new ServerKey(privateKey)
  }

  get publicKey(): string {
    return b64(rawPublic(createPublicKey(this.privateKey)))
  }

  sign(message: Buffer): string {
    return b64(sign(null, message, this.privateKey))
  }
}

export function verifySignature(publicKeyB64: string, message: Buffer, signatureB64: string): boolean {
  const pub = decode(publicKeyB64, 32)
  const sig = decode(signatureB64, 64)
  if (!pub || !sig) return false
  try {
    return verify(null, message, publicKeyOf(pub), sig)
  } catch {
    return false
  }
}
