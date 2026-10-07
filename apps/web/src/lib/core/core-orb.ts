import type { ViewMode } from '../agent/agent-state.svelte'

export interface OrbFrameInputs {
  mode: ViewMode
  amplitude: number
  micLevel: number
  // True while any window is open: the orb recedes behind them.
  dimmed: boolean
  // A background task is running: the progress ring is drawn, and at `lift` the orb makes room for its card.
  working: boolean
  workProgress: number
  lift: boolean
  // "r,g,b" triples: primary and secondary strand colours, and the spark colour.
  colors: { a: string; b: string; w: string }
  // Half the strands, no wide glow and no sub-pixel scaling, for devices that struggle.
  lowQuality: boolean
}

interface Harmonic {
  n: number
  a: number
  ph: number
  w: number
}

interface Strand {
  off: number
  bright: number
  drift: number
  bph: number
  bsp: number
  h: Harmonic[]
  tilt: number
  tph: number
}

interface Spark {
  k: number
  th: number
  v: number
  s: number
}

const TAU = Math.PI * 2
const POINTS = 150
const SEGMENTS = 15
const SPARK_COUNT = 22
const THINK_RGB = '255,205,80'
const DPR_CAP = 1.75
const BOOT_DELAY_MS = 150
const BOOT_RISE_MS = 2600
// While windows cover it the orb is blurred and darkened, so 15fps is invisible; every redraw would also force the
// windows' backdrop blur and the canvas filter to be recomputed.
const DIMMED_FRAME_MS = 1000 / 15
// Receded, the orb is drawn at this fraction of the resolution and the browser's upscale does the blurring, which
// is far cheaper than a CSS blur filter over a full-viewport canvas that changes every frame.
const DIMMED_SCALE = 0.3

const ENERGY_TARGET: Record<ViewMode, number> = { speaking: 0.6, thinking: 0.9, working: 0.55, listening: 0.45, boot: 0.5, idle: 0.15 }

const rand = (): number => Math.random()

function makeSprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.12, `rgba(${rgb},.9)`)
  gr.addColorStop(0.35, `rgba(${rgb},.25)`)
  gr.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return c
}

function makeStrand(): Strand {
  return {
    off: (rand() - 0.5) * 0.09,
    bright: 0.35 + rand() * 0.65,
    drift: (rand() - 0.5) * 0.08,
    bph: rand() * TAU,
    bsp: 0.3 + rand() * 0.9,
    h: [2, 3, 3, 4, 5, 6].map((n) => ({ n, a: (rand() * 0.9 + 0.1) / Math.pow(n, 0.7), ph: rand() * TAU, w: (rand() - 0.5) * 0.7 })),
    tilt: (rand() - 0.5) * 0.5,
    tph: rand() * TAU,
  }
}

// Canvas 2D port of the design's core: noisy polar strands and sparks, additively blended.
// Framework-free so the renderer can be swapped (e.g. for WebGL) without touching components.
export class CoreOrb {
  private raf = 0
  private strands: Strand[]
  private sparks: Spark[]
  private sprites: { a: HTMLCanvasElement; w: HTMLCanvasElement; y: HTMLCanvasElement } | null = null
  private spriteKey = ''
  private pts = new Float32Array((POINTS + 1) * 2)
  private scratch = new Float32Array(2)

  private energy = 0.3
  private amp = 0
  private ampTarget = 0
  private listen = 0
  private think = 0
  private work = 0
  private workP = 0
  private mic = 0
  private dim = 1
  private scale = 1
  private kickValue = 0
  private kickSmooth = 0
  private rot = 0
  private mx = 0
  private my = 0
  private cx = 0
  private cy = 0
  private radius = 0
  private bootAt = performance.now()
  private last = performance.now()

  constructor(
    private canvas: HTMLCanvasElement,
    private inputs: () => OrbFrameInputs,
    strandCount = 32,
  ) {
    const k = Math.max(16, Math.min(80, Math.round(strandCount)))
    this.strands = Array.from({ length: k }, makeStrand)
    this.sparks = Array.from({ length: SPARK_COUNT }, () => ({ k: (rand() * k) | 0, th: rand() * TAU, v: (0.15 + rand() * 0.5) * (rand() < 0.5 ? -1 : 1), s: 0.6 + rand() * 0.8 }))
  }

  start(): void {
    this.last = performance.now()
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop)
      this.frame(now)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
  }

  kick(strength: number): void {
    this.kickValue = strength
  }

  // Pointer position as a fraction of the viewport, -.5..+.5 from its centre (parallax).
  setPointer(mx: number, my: number): void {
    this.mx = mx
    this.my = my
  }

  hits(x: number, y: number, margin = 1.2): boolean {
    return Math.hypot(x - this.cx, y - this.cy) < this.radius * margin
  }

  private ensureSprites(c: OrbFrameInputs['colors']): void {
    const key = `${c.a}|${c.w}`
    if (key === this.spriteKey) return
    this.spriteKey = key
    this.sprites = { a: makeSprite(c.a), w: makeSprite(c.w), y: makeSprite(THINK_RGB) }
  }

  private point(st: Strand, k: number, th: number, t: number, out: Float32Array, i: number, ampK: number, tw: number): void {
    const { cx, cy, radius: R, amp, think, listen } = this
    let r = 1 + st.off * (1 - think * 0.7)
    for (const h of st.h) r += ampK * h.a * Math.sin(h.n * th + h.ph + tw * h.w)
    r += amp * 0.035 * Math.sin(9 * th - t * 12 + k) + listen * 0.02 * Math.sin(14 * th + t * 8)
    const a = th + this.rot + st.drift * t
    const ty = st.tilt * 0.07 * Math.sin(2 * th + st.tph + t * 0.4)
    out[i] = cx + Math.cos(a) * r * R
    out[i + 1] = cy + Math.sin(a) * r * R * 0.985 + ty * R
  }

  private frame(now: number): void {
    const c = this.canvas
    const input = this.inputs()
    if (input.dimmed && now - this.last < DIMMED_FRAME_MS - 2) return
    const dpr = input.dimmed ? DIMMED_SCALE : input.lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, DPR_CAP)
    const w = c.clientWidth
    const h = c.clientHeight
    if (!w || !h) return
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    this.ensureSprites(input.colors)
    const sprites = this.sprites!
    const A = input.colors.a
    const B = input.colors.b
    const ctx = c.getContext('2d')!

    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const t = now / 1000
    const m = input.mode

    this.energy += (ENERGY_TARGET[m] - this.energy) * 0.035
    this.listen += ((m === 'listening' ? 1 : 0) - this.listen) * 0.05
    this.think += ((m === 'thinking' ? 1 : 0) - this.think) * 0.05
    this.work += ((input.working ? 1 : 0) - this.work) * 0.05
    this.workP += (input.workProgress - this.workP) * (input.workProgress < this.workP ? 1 : 0.12)
    this.ampTarget = m === 'speaking' ? input.amplitude : this.ampTarget * 0.85
    this.amp += (this.ampTarget * (0.85 + 0.15 * Math.sin(t * 37)) - this.amp) * 0.22
    this.mic = m === 'listening' ? this.mic + (input.micLevel - this.mic) * 0.25 : this.mic * 0.9
    this.kickSmooth += (this.kickValue - this.kickSmooth) * 0.3
    this.kickValue *= 0.9
    this.dim += ((input.dimmed ? 0.42 : 1) - this.dim) * 0.05
    this.scale += ((input.dimmed ? 0.92 : 1 - this.work * (input.lift ? 0.22 : 0.1)) - this.scale) * 0.05

    const { energy, amp, listen, think, mic, kickSmooth } = this
    const ab = Math.min(1, Math.max(0, (now - this.bootAt - BOOT_DELAY_MS) / BOOT_RISE_MS))
    const boot = 1 - Math.pow(1 - ab, 3)
    const R = Math.min(w, h) * 0.25 * this.scale * (0.6 + 0.4 * boot) * (1 - think * 0.06 - listen * (0.04 - mic * 0.05) + amp * 0.03 + kickSmooth * 0.05)
    const cx = w / 2 + this.mx * 14
    const cy = h * (0.46 - (input.lift && !input.dimmed ? this.work * 0.08 : 0)) + this.my * 10
    this.cx = cx
    this.cy = cy
    this.radius = R
    this.rot += dt * (0.05 + energy * 0.18 + think * 0.9)
    const dim = this.dim * boot

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = 1
    ctx.fillStyle = `rgba(0,0,0,${0.2 + (1 - energy) * 0.1})`
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'

    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.6)
    halo.addColorStop(0, 'rgba(0,0,0,0)')
    halo.addColorStop(0.42, `rgba(${A},${(0.05 + amp * 0.06 + energy * 0.03) * dim})`)
    halo.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.55
    ctx.fillStyle = halo
    ctx.fillRect(cx - R * 1.7, cy - R * 1.7, R * 3.4, R * 3.4)

    const ampK = 0.085 + energy * 0.04 + amp * 0.1 + listen * mic * 0.07 + kickSmooth * 0.05
    const tw = t * (1 + energy * 1.6 + amp * 1.2)
    const glow = new Path2D()
    const pts = this.pts
    const seg = (POINTS / SEGMENTS) | 0
    ctx.lineCap = 'round'
    this.strands.forEach((st, k) => {
      if (input.lowQuality && k % 2 === 1) return
      for (let i = 0; i <= POINTS; i++) this.point(st, k, (i / POINTS) * TAU, t, pts, i * 2, ampK, tw)
      glow.moveTo(pts[0], pts[1])
      for (let i = 1; i <= POINTS; i++) glow.lineTo(pts[i * 2], pts[i * 2 + 1])
      for (let j = 0; j < SEGMENTS; j++) {
        const thm = ((j + 0.5) / SEGMENTS) * TAU
        const b = Math.pow(0.5 + 0.5 * Math.sin(thm * 2 + st.bph + t * st.bsp * (1 + energy)), 2.2)
        const al = (0.05 + b * 0.45) * st.bright * (0.55 + energy * 0.25 + amp * 0.35) * dim
        if (al < 0.015) continue
        ctx.beginPath()
        ctx.moveTo(pts[j * seg * 2], pts[j * seg * 2 + 1])
        for (let i = j * seg + 1; i <= (j + 1) * seg; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
        ctx.globalAlpha = Math.min(1, al)
        ctx.strokeStyle = b > 0.88 && st.bright > 0.75 ? `rgb(${B})` : `rgb(${A})`
        ctx.lineWidth = 0.7 + b * 1.1
        ctx.stroke()
      }
    })
    ctx.globalAlpha = (0.035 + amp * 0.04) * dim
    ctx.strokeStyle = `rgb(${A})`
    ctx.lineWidth = 6
    ctx.stroke(glow)
    if (!input.lowQuality) {
      ctx.globalAlpha = 0.018 * dim
      ctx.lineWidth = 16
      ctx.stroke(glow)
    }

    const sparkCount = Math.min(Math.round(10 + energy * 8 + amp * 10), this.sparks.length)
    for (let i = 0; i < sparkCount; i++) {
      const sp = this.sparks[i]
      sp.th += dt * sp.v * (1 + energy * 2 + think * 3)
      const k = sp.k % this.strands.length
      this.point(this.strands[k], sp.k, sp.th, t, this.scratch, 0, ampK, tw)
      const flicker = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7)
      const s = R * 0.055 * sp.s * (0.8 + amp * 0.8) * flicker
      const sprite = think > 0.4 && i % 2 === 0 ? sprites.y : i % 4 === 0 ? sprites.w : sprites.a
      ctx.globalAlpha = Math.min(1, (0.5 + amp * 0.4) * flicker * dim)
      ctx.drawImage(sprite, this.scratch[0] - s, this.scratch[1] - s, s * 2, s * 2)
    }

    if (think > 0.02) {
      ctx.strokeStyle = `rgb(${THINK_RGB})`
      ctx.lineWidth = 1.2
      for (let j = 0; j < 3; j++) {
        const start = t * (1.6 + j * 0.6) * (j % 2 ? -1 : 1) + j * 2
        const len = 0.35 + 0.25 * Math.sin(t * 2 + j)
        ctx.globalAlpha = 0.45 * think * dim
        ctx.beginPath()
        ctx.arc(cx, cy, R * (1.24 + j * 0.04), start, start + len)
        ctx.stroke()
      }
    }
    if (this.work > 0.02) {
      const ticks = 72
      const rr = R * 1.3
      const wk = this.work * dim
      const head = (t * 0.3) % 1
      ctx.lineWidth = 1.3
      for (let j = 0; j < ticks; j++) {
        const f = j / ticks
        const a = -Math.PI / 2 + f * TAU
        const lit = f < this.workP
        const d = Math.min(Math.abs(f - head), 1 - Math.abs(f - head))
        const sc = Math.max(0, 1 - d * 14)
        ctx.globalAlpha = Math.min(1, (lit ? 0.6 : 0.1) + sc * 0.5) * wk
        ctx.strokeStyle = lit || sc > 0.3 ? `rgb(${B})` : `rgb(${A})`
        const r1 = rr + (j % 6 === 0 ? R * 0.055 : R * 0.025) + sc * R * 0.03
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.stroke()
      }
      ctx.strokeStyle = `rgb(${B})`
      ctx.lineWidth = 1
      for (let j = 0; j < 2; j++) {
        const sa = t * (1.1 + j * 0.5) * (j ? -1 : 1) + j * 3
        ctx.globalAlpha = 0.35 * wk
        ctx.beginPath()
        ctx.arc(cx, cy, R * (1.2 - j * 0.04), sa, sa + 0.5 + 0.2 * Math.sin(t * 2 + j))
        ctx.stroke()
      }
      const pa = -Math.PI / 2 + this.workP * TAU
      const hs = R * 0.09
      ctx.globalAlpha = 0.95 * wk
      ctx.drawImage(sprites.w, cx + Math.cos(pa) * rr - hs, cy + Math.sin(pa) * rr - hs, hs * 2, hs * 2)
    }
    if (listen > 0.02) {
      ctx.strokeStyle = `rgb(${B})`
      ctx.lineWidth = 1
      for (let j = 0; j < 2; j++) {
        const ph = (t * 0.8 + j * 0.5) % 1
        ctx.globalAlpha = 0.3 * listen * ph * dim
        ctx.beginPath()
        ctx.arc(cx, cy, R * (1.6 - ph * 0.5), 0, TAU)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
