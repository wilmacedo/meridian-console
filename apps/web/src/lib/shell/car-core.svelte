<script lang="ts">
  import { viewMode } from '../agent/agent-state.svelte'
  import { busy, mic, toggleListening } from '../voice/microphone.svelte'
  import { wm } from '../windows/window-manager.svelte'
  import { switchFx } from '../workspace/switch-fx.svelte'
  import { carGeometry } from './car.svelte'
  import { carHint } from './car-hint'

  const g = $derived(carGeometry())
  const mode = $derived(viewMode())
  const listening = $derived(mode === 'listening')
  const halted = $derived(mic.halted && !listening && mode !== 'thinking')
  const stoppable = $derived(!listening && !halted && mode !== 'boot' && busy())

  // The time counter only needs to move once a second.
  let now = $state(performance.now())
  $effect(() => {
    if (!listening) return
    now = performance.now()
    const timer = setInterval(() => (now = performance.now()), 500)
    return () => clearInterval(timer)
  })
  const hint = $derived(carHint({ mode, listenedSeconds: listening ? Math.max(0, Math.floor((now - mic.since) / 1000)) : 0, halted, busy: stoppable, cancelled: mic.cancelled }))
  const ring = $derived(listening ? 'rgba(var(--nx-ac), 0.6)' : stoppable || halted ? 'rgba(var(--nx-wn), 0.55)' : 'rgba(var(--nx-ac), 0.16)')
  const hidden = $derived(wm.wins.some((w) => !w.closing))

</script>

{#if !hidden}
  <button
    class="core"
    aria-label={hint}
    style:left="{g.ox}px"
    style:top="{g.oy}px"
    style:width="{g.ringDiameter}px"
    style:height="{g.ringDiameter}px"
    style:--ring={ring}
    style:cursor={halted ? 'default' : 'pointer'}
    style:opacity={switchFx.current ? 0 : 1}
    onclick={() => void toggleListening()}
  ></button>
  <div class="hint" style:left="{g.ox}px" style:top="{g.hintTop}px" style:opacity={switchFx.current ? 0 : 1}>{hint}</div>
{/if}

<style>
  .core {
    position: absolute;
    z-index: 4;
    transform: translate(-50%, -50%);
    padding: 0;
    border: 1px dashed var(--ring);
    border-radius: 50%;
    background: none;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 0.4s,
      opacity 0.34s ease;
  }
  .hint {
    position: absolute;
    z-index: 4;
    transform: translateX(-50%);
    pointer-events: none;
    white-space: nowrap;
    font: 400 12px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.8);
    transition: opacity 0.34s ease;
  }
</style>
