import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export interface WhatsappConfig {
  dataDir: string
  bridgeBin: string
  port: number
  // Folders a file may be sent from: what was downloaded or spoken here, the messages the owner records for NOX
  // to send, plus whatever the owner adds.
  sendDirs: string[]
  outbox: string
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): WhatsappConfig {
  const meridianDir = env.MERIDIAN_DATA_DIR || join(homedir(), '.meridian')
  const dataDir = env.WHATSAPP_DATA_DIR || join(meridianDir, 'whatsapp')
  return {
    dataDir,
    bridgeBin: env.WHATSAPP_BRIDGE_BIN || join(dataDir, 'bin', 'bridge'),
    port: Number(env.WHATSAPP_BRIDGE_PORT) || 7420,
    outbox: join(dataDir, 'outbox'),
    sendDirs: [join(dataDir, 'media'), join(dataDir, 'outbox'), join(meridianDir, 'recordings'), ...(env.WHATSAPP_SEND_DIRS ?? '').split(delimiter).filter(Boolean)],
  }
}
