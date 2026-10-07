export interface SwitchFx {
  // out: the screen is leaving the old workspace; in: the new one has loaded; leave: the banner fades.
  phase: 'out' | 'in' | 'leave'
  key: string
  name: string
  // "01", the workspace's place in the switcher.
  code: string
  // The first load of the page, which reads "BOOTING · WORKSPACE".
  boot: boolean
}

// The banner shown over the core while a workspace loads or the page boots into one.
export const switchFx = $state({ current: null as SwitchFx | null })

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const BANNER_IN_MS = 950
const BANNER_LEAVE_MS = 400

// Plays out the rest of the banner once the new workspace is on screen.
export async function finishSwitchFx(): Promise<void> {
  const fx = switchFx.current
  if (!fx) return
  switchFx.current = { ...fx, phase: 'in' }
  await sleep(BANNER_IN_MS)
  if (switchFx.current?.key !== fx.key) return
  switchFx.current = { ...fx, phase: 'leave' }
  await sleep(BANNER_LEAVE_MS)
  if (switchFx.current?.key === fx.key) switchFx.current = null
}

export const startSwitchFx = (name: string, code: string, boot = false): void => {
  switchFx.current = { phase: 'out', key: `fx-${Date.now()}`, name, code, boot }
}

// The page loads into a workspace: the banner holds a little longer than for a switch.
export async function playBootFx(name: string, code: string): Promise<void> {
  startSwitchFx(name, code, true)
  const key = switchFx.current!.key
  await sleep(1500)
  if (switchFx.current?.key !== key) return
  switchFx.current = { ...switchFx.current, phase: 'in' }
  await sleep(800)
  if (switchFx.current?.key !== key) return
  switchFx.current = { ...switchFx.current, phase: 'leave' }
  await sleep(400)
  if (switchFx.current?.key === key) switchFx.current = null
}
