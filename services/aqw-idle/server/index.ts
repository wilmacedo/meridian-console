import { defineServerService, type ServiceStatus } from '@meridian/service-sdk/server'
import { SOURCE_URL, packetRoutes } from './packets.js'

const STATUS_TIMEOUT_MS = 2000

// /packets is an SSE stream that may not send its headers until the first event, so it is useless
// as a health probe on an idle source. Any HTTP answer from the root proves the process is up.
async function status(): Promise<ServiceStatus> {
  try {
    await fetch(SOURCE_URL, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) })
    return { state: 'online' }
  } catch {
    return { state: 'offline', message: 'packet source unreachable' }
  }
}

export default defineServerService({
  manifest: {
    id: 'aqw-idle',
    name: 'aqw-idle',
    mono: 'AQ',
    desc: 'Live packet stream from aqw-idle-presence',
    address: new URL(SOURCE_URL).host,
  },
  routes: packetRoutes,
  status,
})
