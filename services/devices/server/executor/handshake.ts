import { randomBytes } from 'node:crypto'
import { b64, decode, verifySignature, type ServerKey } from './keys.js'

// What each side signs. Both nonces are fresh for the connection, so a recorded exchange proves nothing later, and
// each message names the other side's key, so a proof made for one server or device cannot be replayed to another.
// All fields are 32 bytes, so the concatenation is unambiguous. The executor implements the same two functions.
const SERVER_CONTEXT = Buffer.from('meridian-executor/v1/server\0')
const DEVICE_CONTEXT = Buffer.from('meridian-executor/v1/device\0')

const message = (context: Buffer, ...fields: Buffer[]): Buffer => Buffer.concat([context, ...fields])

export const newNonce = (): string => b64(randomBytes(32))

export function serverProof(key: ServerKey, clientNonce: string, serverNonce: string, devicePublicKey: string): string | undefined {
  const fields = [clientNonce, serverNonce, devicePublicKey].map((f) => decode(f, 32))
  if (fields.some((f) => !f)) return undefined
  return key.sign(message(SERVER_CONTEXT, ...(fields as Buffer[])))
}

export function verifyDeviceProof(devicePublicKey: string, clientNonce: string, serverNonce: string, serverPublicKey: string, signature: string): boolean {
  const fields = [clientNonce, serverNonce, serverPublicKey].map((f) => decode(f, 32))
  if (fields.some((f) => !f)) return false
  return verifySignature(devicePublicKey, message(DEVICE_CONTEXT, ...(fields as Buffer[])), signature)
}
