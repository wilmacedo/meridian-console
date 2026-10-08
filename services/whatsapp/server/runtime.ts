import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { Emit } from '@meridian/service-sdk/server'
import { BridgeClient } from './bridge-client.js'
import { BridgeProcess } from './bridge-process.js'
import { readConfig, type WhatsappConfig } from './config.js'
import { SendLimiter } from './send-policy.js'

interface Runtime {
  config: WhatsappConfig
  limiter: SendLimiter
  client: BridgeClient
  process: BridgeProcess
}

let runtime: Runtime | undefined
let emitter: Emit | undefined

// The token lives only in this process and in the bridge's environment, so nothing else on the machine can
// talk to the bridge even though its port is on loopback.
export function getRuntime(emit?: Emit): Runtime {
  if (emit) emitter = emit
  if (runtime) return runtime
  const config = readConfig()
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  const token = randomBytes(32).toString('hex')
  const addr = `127.0.0.1:${config.port}`
  runtime = {
    config,
    limiter: new SendLimiter(),
    client: new BridgeClient(`http://${addr}`, token),
    process: new BridgeProcess({ bin: config.bridgeBin, dataDir: config.dataDir, addr, token }, (level, message) => emitter?.(level, message)),
  }
  return runtime
}

export function stopRuntime(): void {
  runtime?.process.stop()
  runtime = undefined
}

// One line in the event stream per send; never the text.
export const audit = (message: string): void => emitter?.('info', `whatsapp: ${message}`)
