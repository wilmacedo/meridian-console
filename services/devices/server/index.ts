import { defineServerService, type ServiceStatus } from '@meridian/service-sdk/server'
import { appActions } from './app-ui/actions.js'
import { executorActions } from './executor/actions.js'
import { executorRoutes } from './executor/routes.js'
import { browserActions } from './browser/actions.js'
import { browserRoutes } from './browser/routes.js'
import { getRuntime } from './runtime.js'

async function status(): Promise<ServiceStatus> {
  const { killSwitch, gateway, executors } = getRuntime()
  if (killSwitch.engaged()) return { state: 'degraded', message: 'kill switch on: every device is disconnected' }
  const browsers = gateway.list().map((c) => c.profile)
  const machines = executors.list().map((c) => c.name)
  const online = [...browsers, ...machines]
  return { state: 'online', message: online.length ? `connected: ${online.join(', ')}` : 'standing by: no device is connected' }
}

export default defineServerService({
  manifest: {
    id: 'devices',
    name: 'devices',
    desc: "Lets NOX act on the owner's own machines: browsers and desktop apps",
    runtime: 'node',
  },
  routes: async (app) => {
    const { store, gateway, executors } = getRuntime()
    gateway.start()
    executors.start()
    await app.register(browserRoutes(store, gateway))
    await app.register(executorRoutes(executors))
  },
  status,
  actions: [
    {
      id: 'status',
      method: 'GET',
      path: '/status',
      title: 'Devices status',
      description: 'Which devices are paired and whether the kill switch is on. It only looks.',
      mutating: false,
      run: async () => {
        const { store, killSwitch, gateway, executors } = getRuntime()
        const online = new Set([...gateway.list(), ...executors.list()].map((c) => c.device.id))
        return { killSwitch: killSwitch.engaged() ? 'on' : 'off', devices: store.devices().map((d) => ({ id: d.id, kind: d.kind, label: d.label, lastSeen: d.lastSeen, connected: online.has(d.id) })) }
      },
    },
    {
      id: 'kill',
      method: 'POST',
      path: '/kill',
      title: 'Kill switch on',
      description: 'Disconnects every device at once and refuses new connections until the owner turns it off. Use it the moment the owner says stop, or when something on a device looks wrong. It never asks first.',
      mutating: false,
      run: async () => `Kill switch on. ${getRuntime().killSwitch.engage()} connection(s) closed; no device can connect until it is turned off.`,
    },
    {
      id: 'resume',
      method: 'POST',
      path: '/resume',
      title: 'Kill switch off',
      description: 'Lets devices connect again after a kill switch. The owner confirms.',
      mutating: false,
      gated: true,
      run: async (_: unknown, ctx) => {
        if (!(await ctx.confirm('Turn the kill switch off: devices may connect again'))) throw new Error('The owner did not confirm this, so it was not done.')
        getRuntime().killSwitch.resume()
        return 'Kill switch off. Devices may connect again.'
      },
    },
    ...browserActions(getRuntime()),
    ...appActions(getRuntime()),
    ...executorActions(getRuntime()),
  ],
})
