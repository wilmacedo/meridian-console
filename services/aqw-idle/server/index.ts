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

async function presenceCall(method: 'GET' | 'POST', path: string): Promise<unknown> {
  const res = await fetch(`${SOURCE_URL}${path}`, { method, signal: AbortSignal.timeout(30_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`aqw-idle-presence ${path} responded ${res.status}: ${JSON.stringify(body)}`)
  return body
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
  actions: [
    {
      id: 'presence-status',
      method: 'GET',
      path: '/presence-status',
      title: 'Presence status',
      description: 'Connection state and current area of aqw-idle-presence',
      mutating: false,
      run: async () => presenceCall('GET', '/status'),
    },
    {
      id: 'login',
      method: 'POST',
      path: '/login',
      title: 'Login',
      description: 'Connects aqw-idle-presence to the game',
      mutating: true,
      run: async () => presenceCall('POST', '/login'),
    },
    {
      id: 'logout',
      method: 'POST',
      path: '/logout',
      title: 'Logout',
      description: 'Logs aqw-idle-presence out and disconnects',
      mutating: true,
      run: async () => presenceCall('POST', '/logout'),
    },
  ],
})
