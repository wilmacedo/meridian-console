import { defineServerService, type ServiceStatus } from '@meridian/service-sdk/server'
import { calendarActions } from './calendar-actions.js'
import { calendarRoutes } from './calendar-routes.js'
import { getRuntime, missingConfig, setEmitter } from './runtime.js'

async function status(): Promise<ServiceStatus> {
  const problem = missingConfig()
  if (problem) return { state: 'offline', message: problem }

  const { store } = getRuntime()
  const pending = store.accounts().filter((a) => a.status === 'pending')
  if (pending.length) return { state: 'degraded', message: `${pending.map((a) => a.email).join(', ')} needs to sign in again` }
  return { state: 'online', message: store.accounts().length ? undefined : 'no account connected yet' }
}

export default defineServerService({
  manifest: {
    id: 'calendar',
    name: 'calendar',
    mono: 'CA',
    desc: 'Google Calendar · every account in one view',
  },
  routes: calendarRoutes,
  status,
  actions: calendarActions,
  events: (emit) => {
    setEmitter(emit)
    return () => setEmitter(undefined)
  },
})
