import { defineServerService, type ServiceStatus } from '@meridian/service-sdk/server'
import { SOURCE_URL, packetRoutes } from './packets.js'

const STATUS_TIMEOUT_MS = 2000

// /packets is an SSE stream that may not send its headers until the first event, so it is useless
// as a health probe on an idle source. Any HTTP answer from the root proves the process is up.
async function status(): Promise<ServiceStatus> {
  try {
    await fetch(SOURCE_URL, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) })
    return { state: 'ok', facts: [{ label: 'SOURCE', value: SOURCE_URL }] }
  } catch {
    return { state: 'err', message: 'packet source unreachable' }
  }
}

export default defineServerService({
  manifest: {
    id: 'aqw-idle',
    name: 'aqw-idle',
    kind: 'packet-stream',
    tag: 'SOCKET',
    description: 'Live packet stream relayed from aqw-idle-presence',
  },
  routes: packetRoutes,
  status,
})
