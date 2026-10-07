// Brings the owner's debug Chrome up only when something needs it, and lets go of it when nobody does: the SSH
// tunnel is opened on demand and dropped after a quiet spell, and Chrome is started on the other machine by a
// command run over ssh. No I/O of its own (it is handed `deps`), so the logic is tested without a network.

export interface BrokerDeps {
  // Chrome's debug port answers (through the tunnel).
  reachable: () => Promise<boolean>
  // Something listens on the local end of the tunnel: ours, or one started by hand.
  portOpen: () => Promise<boolean>
  startTunnel: () => { alive: () => boolean; kill: () => void; lastError: () => string }
  // Runs a command on the Chrome machine over ssh; rejects with something readable.
  runRemote: (command: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
  log: (event: string) => void
}

export interface BrokerConfig {
  // The ssh host that runs Chrome. Without it nothing is started: Chrome and the tunnel are the owner's to bring up.
  sshHost?: string
  // What starts Chrome there, run over ssh.
  launchCommand: string
  idleMs: number
  tunnelWaitMs: number
  launchWaitMs: number
  pollMs: number
}

export interface Broker {
  // Resolves when Chrome's debug port answers, starting what is missing; rejects with why it could not.
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
    if (!host) throw new Error("Chrome's debug port does not answer and nothing is set to start it: bring up Chrome and the tunnel by hand, or set MERIDIAN_BROWSER_SSH_HOST (see the service README).")

    if (await deps.portOpen()) external = !ours()
    else {
      external = false
      tunnel = deps.startTunnel()
      deps.log(`tunnel to ${host} opened`)
      const up = await until(deps.portOpen, cfg.tunnelWaitMs, () => !tunnel?.alive())
      if (!up) {
        const why = tunnel?.lastError().trim().split('\n').at(-1) ?? ''
        stop()
        throw new Error(`could not open the ssh tunnel to ${host}${why ? `: ${why}` : ''}. Is the machine on and reachable over ssh?`)
      }
    }

    if (await deps.reachable()) return touch()

    deps.log(`starting Chrome on ${host}`)
    try {
      await deps.runRemote(cfg.launchCommand)
    } catch (err) {
      throw new Error(`could not start Chrome on ${host}: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!(await until(deps.reachable, cfg.launchWaitMs))) {
      throw new Error(`Chrome was started on ${host} but its debug port did not answer within ${Math.round(cfg.launchWaitMs / 1000)}s; a window may be waiting for the owner (a first-run dialog, an update).`)
    }
    touch()
  }

  return {
    ensure: () => (starting ??= bringUp().finally(() => (starting = undefined))),
    stop,
    tunnel: () => (ours() ? 'ours' : external ? 'external' : 'none'),
  }
}
