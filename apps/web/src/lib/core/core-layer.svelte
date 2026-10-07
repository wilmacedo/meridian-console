<script lang="ts">
  import { onMount } from 'svelte'
  import { agent, kick, onKick, viewMode } from '../agent/agent-state.svelte'
  import { toggleListening } from '../voice/microphone.svelte'
  import { layout } from '../workspace/layout.svelte'
  import { wm } from '../windows/window-manager.svelte'
  import { activeVariant, isLight } from '../theme/theme.svelte'
  import { CoreOrb } from './core-orb'
  import { orbQuality } from './orb-quality.svelte'

  let canvas: HTMLCanvasElement
  let orb: CoreOrb | undefined
  let pointer = $state(false)

  const dimmed = $derived(wm.active !== 'core')
  const filter = $derived.by(() => {
    const invert = isLight() ? 'invert(1) hue-rotate(180deg)' : ''
    const recede = dimmed ? (isLight() ? 'opacity(.45)' : 'brightness(.55) saturate(1.2)') : ''
    return `${invert} ${recede}`.trim() || 'none'
  })

  onMount(() => {
    const o = new CoreOrb(canvas, () => {
      const v = activeVariant()
      return { mode: viewMode(), amplitude: agent.amplitude, micLevel: agent.micLevel, dimmed, working: agent.working, workProgress: agent.workProgress, lift: layout.h >= 720 && !dimmed, colors: { a: v.orbA, b: v.orbB, w: v.orbW }, lowQuality: orbQuality.value === 'low' }
    })
    orb = o
    o.start()
    const stopKick = onKick((s) => o.kick(s))
    return () => {
      o.stop()
      stopKick()
    }
  })

  function onPointerMove(e: PointerEvent): void {
    orb?.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5)
    pointer = !dimmed && !!orb?.hits(e.clientX, e.clientY)
  }

  function onClick(e: MouseEvent): void {
    if (dimmed || !orb?.hits(e.clientX, e.clientY)) return
    void toggleListening()
  }
</script>

<svelte:window onpointermove={onPointerMove} />

<div class="grid fine"></div>
<div class="grid coarse"></div>
<canvas bind:this={canvas} onclick={onClick} style:filter style:cursor={pointer ? 'pointer' : 'default'}></canvas>
<div class="vignette"></div>

<style>
  .grid,
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .grid {
    background-position: center center;
  }
  .coarse {
    background-image:
      linear-gradient(rgba(var(--nx-hi), 0.17) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--nx-hi), 0.17) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(ellipse 75% 70% at 50% 46%, rgb(var(--nx-bg)) 30%, transparent 100%);
  }
  .fine {
    background-image:
      linear-gradient(rgba(var(--nx-hi), 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--nx-hi), 0.045) 1px, transparent 1px);
    background-size: 11px 11px;
    mask-image: radial-gradient(ellipse 50% 45% at 50% 46%, rgb(var(--nx-bg)) 20%, transparent 100%);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    transition: filter 0.7s ease;
  }
  .vignette {
    background: radial-gradient(ellipse at center, transparent 60%, rgba(var(--nx-vg), var(--nx-vga)) 100%);
  }
</style>
