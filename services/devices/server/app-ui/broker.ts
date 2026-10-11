// Brings the SSH tunnel to an app's debug port up when something needs it and lets go of it after a quiet spell.
// Moved from the retired browser-harness broker, minus starting the app: the owner starts it themselves with the
// debug option, so a closed port is reported, not worked around. No I/O of its own (it is handed `deps`), so the
// logic is tested without a network.

export interface BrokerDeps {
  // The app's debug port answers (through the tunnel).
  reachable: () => Promise<boolean>
  // Something listens on the local end of the tunnel: ours, or one started by hand.
  portOpen: () => Promise<boolean>
  startTunnel: () => { alive: () => boolean; kill: () => void; lastError: () => string }
  sleep: (ms: number) => Promise<void>
  log: (event: string) => void
}

export interface BrokerConfig {
  // The ssh host that runs the app. Without it no tunnel is opened: the owner brings it up.
  sshHost?: string
  // What to tell the owner when the port is closed.
  closedHint: string
  idleMs: number
  tunnelWaitMs: number
  pollMs: number
}

export interface Broker {
  // Resolves when the debug port answers, opening the tunnel if needed; rejects with why it could not.
  ensure: () => Promise<void>
  // Lets go of the tunnel it opened (never one started by hand).
  stop: () => void
  tunnel: () => 'ours' | 'external' | 'none'
}

export function createBroker(cfg: BrokerConfig, deps: BrokerDeps): Broker {
  let tunnel: ReturnType<BrokerDeps['startTunnel']> | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  let starting: Promise<void> | undefined
  let external = false

  const ours = (): boolean => tunnel !== undefined && tunnel.alive()

  function touch(): void {
    clearTimeout(idle)
    if (!ours()) return
    idle = setTimeout(() => {
      deps.log('idle: tunnel closed')
      stop()
    }, cfg.idleMs)
    idle.unref?.()
  }

  function stop(): void {
    clearTimeout(idle)
    tunnel?.kill()
    tunnel = undefined
  }

  async function until(check: () => Promise<boolean>, waitMs: number, giveUp?: () => boolean): Promise<boolean> {
    for (let waited = 0; waited <= waitMs; waited += cfg.pollMs) {
      if (await check()) return true
      if (giveUp?.()) return false
      await deps.sleep(cfg.pollMs)
    }
    return false
  }

  async function bringUp(): Promise<void> {
    if (await deps.reachable()) return touch()
    const host = cfg.sshHost
    if (!host) throw new Error(`The app's debug port does not answer and no ssh host is set to reach it. ${cfg.closedHint}`)

    if (await deps.portOpen()) external = !ours()
    else {
      external = false
      tunnel = deps.startTunnel()
      deps.log(`tunnel to ${host} opened`)
      const up = await until(deps.portOpen, cfg.tunnelWaitMs, () => !tunnel?.alive())
      if (!up) {
        const why = tunnel?.lastError().trim().split('\n').at(-1) ?? ''
        stop()
        throw new Error(`Could not open the ssh tunnel to ${host}${why ? `: ${why}` : ''}. Is the machine on and reachable over ssh?`)
      }
    }

    if (await deps.reachable()) return touch()
    // The tunnel only forwards: a closed port on the other end shows up as a connection that goes nowhere.
    touch()
    throw new Error(`The app is not listening on its debug port. ${cfg.closedHint}`)
  }

  return {
    ensure: () => (starting ??= bringUp().finally(() => (starting = undefined))),
    stop,
    tunnel: () => (ours() ? 'ours' : external ? 'external' : 'none'),
  }
}
