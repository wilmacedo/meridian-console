<script lang="ts">
  import { agent, viewMode, type ViewMode } from '../agent/agent-state.svelte'
  import { live } from '../live/stream.svelte'

  const LABELS: Record<ViewMode, string> = { boot: 'BOOTING', idle: 'STANDBY', listening: 'LISTENING', thinking: 'THINKING', working: 'WORKING', speaking: 'SPEAKING' }
  const TICKS = 24

  let frame = $state(0)
  $effect(() => {
    const timer = setInterval(() => frame++, 140)
    return () => clearInterval(timer)
  })

  const mode = $derived(viewMode())
  const offline = $derived(live.link === 'offline')
  const color = $derived(offline ? '#ff6b8a' : mode === 'thinking' || mode === 'working' ? 'rgb(var(--nx-fg))' : 'rgb(var(--nx-ac))')
  const active = $derived(!offline && mode !== 'idle' && mode !== 'boot')
  const ticks = $derived(
    Array.from({ length: TICKS }, (_, i) => {
      const wide = i % 6 === 0
      // WORKING: a short lit run travelling along the bar.
      const lit = mode === 'working' ? (((i - frame) % TICKS) + TICKS) % TICKS < 5 : active ? Math.sin(frame * 0.9 + i * 0.7) > (mode === 'thinking' ? -0.2 : 0.3) : wide
      return { wide, lit }
    }),
  )
</script>

<div class="state" style:color style:--glow={color}>
  <div class="label">{offline ? 'OFFLINE' : LABELS[mode]}</div>
  <div class="ticks">
    {#each ticks as tick}
      <span class:wide={tick.wide} class:lit={tick.lit}></span>
    {/each}
  </div>
</div>

<style>
  .state {
    position: absolute;
    top: 58px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    pointer-events: none;
    transition: color 0.4s;
  }
  .label {
    font: 600 15px/1 var(--font-mono);
    letter-spacing: 0.62em;
    padding-left: 0.62em;
    text-shadow: 0 0 12px var(--glow);
  }
  .ticks {
    display: flex;
    gap: 3px;
    align-items: center;
  }
  .ticks span {
    width: 3px;
    height: 1px;
    background: currentColor;
    opacity: 0.2;
  }
  .ticks span.wide {
    width: 8px;
  }
  .ticks span.lit {
    opacity: 0.85;
  }
</style>
