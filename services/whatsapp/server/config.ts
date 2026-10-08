import { homedir } from 'node:os'
import { join } from 'node:path'

export interface WhatsappConfig {
  dataDir: string
  bridgeBin: string
  port: number
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): WhatsappConfig {
  const dataDir = env.WHATSAPP_DATA_DIR || join(env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian'), 'whatsapp')
  return {
    dataDir,
    bridgeBin: env.WHATSAPP_BRIDGE_BIN || join(dataDir, 'bin', 'bridge'),
    port: Number(env.WHATSAPP_BRIDGE_PORT) || 7420,
  }
}
