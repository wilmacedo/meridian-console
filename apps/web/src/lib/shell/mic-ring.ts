import type { ViewMode } from '../agent/agent-state.svelte'

export interface MicRingInputs {
  mode: ViewMode
  amplitude: number
  micLevel: number
  workProgress: number
  // performance.now() of the last halt, 0 if none.
  haltedAt: number
  // "r,g,b" triples: the orb's two strand colours and the warning amber.
  colors: { a: string; b: string; wn: string }
}

const TAU = Math.PI * 2
const SIZE = 140
const CENTER = SIZE / 2
const BARS = 56
const INNER_RADIUS = 36
const OUTER_RADIUS = 60
const HALT_BURST_MS = 900

// The ring of bars around the mic button: a level meter while listening or speaking, a sweeping head while NOX
// thinks or works, a burst when it is halted. Framework-free like the orb.
export class MicRing {
  private raf = 0
  private levels = new Float32Array(BARS)

  constructor(
    private canvas: HTMLCanvasElement,
    private inputs: () => MicRingInputs,
  ) {}

  start(): void {
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop)
      this.draw(now / 1000)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
  }

  private draw(t: number): void {
    const c = this.canvas
    const input = this.inputs()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (c.width !== Math.round(SIZE * dpr)) c.width = c.height = Math.round(SIZE * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, SIZE, SIZE)

    const { mode, colors } = input
    const listening = mode === 'listening'
    const speaking = mode === 'speaking'
    const thinking = mode === 'thinking'
    const working = mode === 'working'
    const halt = input.haltedAt ? Math.max(0, 1 - (performance.now() - input.haltedAt) / HALT_BURST_MS) : 0

    ctx.lineCap = 'round'
    ctx.lineWidth = 1.6
    for (let j = 0; j < BARS; j++) {
      const f = j / BARS
      const a = -Math.PI / 2 + f * TAU
      let target = 0.06 + 0.05 * Math.sin(t * 1.4 + j * 0.45)
      if (listening) target = 0.12 + input.micLevel * (0.35 + 0.65 * Math.abs(Math.sin(j * 1.7 + t * 9))) * (0.55 + 0.45 * Math.sin(j * 0.9 - t * 5))
      else if (speaking) target = 0.1 + input.amplitude * 0.9 * Math.abs(Math.sin(f * TAU * 3 + t * 4))
      else if (thinking || working) target = 0.08
      this.levels[j] += (Math.max(0, target) - this.levels[j]) * 0.25
      const v = this.levels[j]
      const len = 2 + v * 16
      let alpha = 0.2 + v * 1.1
      if (thinking || working) {
        const head = (t * (thinking ? 1.3 : 0.45)) % 1
        const d = Math.min(Math.abs(f - head), 1 - Math.abs(f - head))
        alpha = 0.14 + Math.max(0, 1 - d * 9) * 0.86
        if (working && f < input.workProgress) alpha = Math.max(alpha, 0.55)
      }
      ctx.globalAlpha = Math.min(1, alpha) * (halt ? 1 - halt * 0.7 : 1)
      ctx.strokeStyle = `rgb(${v > 0.3 || alpha > 0.55 ? colors.b : colors.a})`
      ctx.beginPath()
      ctx.moveTo(CENTER + Math.cos(a) * INNER_RADIUS, CENTER + Math.sin(a) * INNER_RADIUS)
      ctx.lineTo(CENTER + Math.cos(a) * (INNER_RADIUS + len), CENTER + Math.sin(a) * (INNER_RADIUS + len))
      ctx.stroke()
    }

    if (halt > 0) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgb(${colors.wn})`
      ctx.lineWidth = 1.5
      ctx.globalAlpha = halt
      ctx.beginPath()
      ctx.arc(CENTER, CENTER, INNER_RADIUS + 4 + (1 - halt) * 26, 0, TAU)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    }

    ctx.lineWidth = 1
    ctx.globalAlpha = 0.16
    ctx.strokeStyle = `rgb(${colors.a})`
    ctx.beginPath()
    ctx.arc(CENTER, CENTER, OUTER_RADIUS, 0, TAU)
    ctx.stroke()
    const orbit = t * (listening ? 1.6 : 0.35)
    ctx.globalAlpha = listening ? 0.9 : 0.4
    ctx.fillStyle = `rgb(${colors.b})`
    for (let k = 0; k < (listening ? 2 : 1); k++) {
      const angle = orbit + k * Math.PI
      ctx.beginPath()
      ctx.arc(CENTER + Math.cos(angle) * OUTER_RADIUS, CENTER + Math.sin(angle) * OUTER_RADIUS, 1.6, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}
