<script lang="ts">
  import { onMount } from 'svelte'
  import { agent, kick, onKick, viewMode } from '../agent/agent-state.svelte'
  import { toggleListening } from '../voice/microphone.svelte'
  import { layout } from '../workspace/layout.svelte'
  import { prefs } from '../workspace/prefs.svelte'
  import { switchFx } from '../workspace/switch-fx.svelte'
  import { wm } from '../windows/window-manager.svelte'
  import { activeVariant, isLight } from '../theme/theme.svelte'
  import { carGeometry, isCar } from '../shell/car.svelte'
  import { CoreOrb } from './core-orb'
  import { orbQuality } from './orb-quality.svelte'

  let canvas: HTMLCanvasElement
  let orb: CoreOrb | undefined
  let pointer = $state(false)

  const dimmed = $derived(wm.active !== 'core')
  const car = $derived(isCar() ? carGeometry() : undefined)
  const filter = $derived.by(() => {
    const invert = isLight() ? 'invert(1) hue-rotate(180deg)' : ''
    const recede = dimmed ? (isLight() ? 'opacity(.45)' : 'brightness(.55) saturate(1.2)') : ''
    const switching = switchFx.current && switchFx.current.phase !== 'leave' ? 'blur(5px) brightness(.6)' : ''
    return `${invert} ${recede} ${switching}`.trim() || 'none'
  })

  onMount(() => {
    const o = new CoreOrb(canvas, () => {
      const v = activeVariant()
      return { mode: viewMode(), amplitude: agent.amplitude, micLevel: agent.micLevel, dimmed, working: agent.working, workProgress: agent.workProgress, lift: (car !== undefined || layout.h >= 720) && !dimmed, place: car && { x: car.ox, y: car.oy, r: car.radius }, colors: { a: v.orbA, b: v.orbB, w: v.orbW }, lowQuality: orbQuality.value === 'low' }
    })
    orb = o
    o.setStrandCount(prefs.strands)
    o.start()
    const stopKick = onKick((s) => o.kick(s))
    return () => {
      o.stop()
      stopKick()
    }
  })

  $effect(() => orb?.setStrandCount(prefs.strands))

  function onPointerMove(e: PointerEvent): void {
    orb?.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5)
    pointer = !dimmed && !!orb?.hits(e.clientX, e.clientY)
  }

  function onClick(e: MouseEvent): void {
    // In the car the core has a button of its own.
    if (car || dimmed || !orb?.hits(e.clientX, e.clientY)) return
    void toggleListening()
  }
</script>

<svelte:window onpointermove={onPointerMove} />

{#if prefs.grid}
  <div class="grid fine" class:car style:--zone-w="{car?.zoneW}px" style:--zone-h="{car?.zoneH}px"></div>
  <div class="grid coarse" class:car style:--zone-w="{car?.zoneW}px" style:--zone-h="{car?.zoneH}px"></div>
{/if}
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
  /* In the car the grid fades out around the core, which sits in the room the tiles leave. */
  .grid.car {
    inset: auto;
    left: 0;
    top: 0;
    width: var(--zone-w);
    height: var(--zone-h);
  }
  .coarse.car {
    mask-image: radial-gradient(farthest-side at 50% 47%, rgb(var(--nx-bg)) 30%, transparent 100%);
  }
  .fine.car {
    mask-image: radial-gradient(closest-side at 50% 47%, rgb(var(--nx-bg)) 15%, transparent 100%);
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
