import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export interface WhatsappConfig {
  dataDir: string
  bridgeBin: string
  port: number
  // Folders a file may be sent from: what was downloaded or spoken here, plus whatever the owner adds.
  sendDirs: string[]
  outbox: string
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): WhatsappConfig {
  const dataDir = env.WHATSAPP_DATA_DIR || join(env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian'), 'whatsapp')
  return {
    dataDir,
    bridgeBin: env.WHATSAPP_BRIDGE_BIN || join(dataDir, 'bin', 'bridge'),
    port: Number(env.WHATSAPP_BRIDGE_PORT) || 7420,
    outbox: join(dataDir, 'outbox'),
    sendDirs: [join(dataDir, 'media'), join(dataDir, 'outbox'), ...(env.WHATSAPP_SEND_DIRS ?? '').split(delimiter).filter(Boolean)],
  }
}
