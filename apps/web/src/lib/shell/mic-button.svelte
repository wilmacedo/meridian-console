<script lang="ts">
  import { onMount } from 'svelte'
  import { agent, viewMode } from '../agent/agent-state.svelte'
  import { dock } from '../dock/dock.svelte'
  import { live } from '../live/stream.svelte'
  import { activeVariant } from '../theme/theme.svelte'
  import { busy, cancelListening, mic, micAvailable, toggleListening } from '../voice/microphone.svelte'
  import { MicRing } from './mic-ring'

  let canvas: HTMLCanvasElement
  // The capsule stays a moment after the recording ends, to fold back into the button.
  let capClosing = $state(false)
  let wasListening = false
  let capTimer: ReturnType<typeof setTimeout> | undefined

  const mode = $derived(viewMode())
  const offline = $derived(live.link === 'offline')
  const unavailable = $derived(!micAvailable() || offline)
  const listening = $derived(mode === 'listening')
  const thinking = $derived(mode === 'thinking')
  const halted = $derived(mic.halted && !listening && !thinking)
  // Something NOX is doing that a tap stops.
  const stoppable = $derived(!listening && !halted && mode !== 'boot' && (busy() || dock.pending !== null))
  const amber = $derived(stoppable || halted)

  const capShow = $derived(listening || capClosing)

  $effect(() => {
    if (wasListening && !listening) {
      capClosing = true
      clearTimeout(capTimer)
      capTimer = setTimeout(() => (capClosing = false), 420)
    }
    wasListening = listening
  })

  const tip = $derived(
    offline ? 'Offline: NOX cannot hear you right now'
    : !micAvailable() ? 'The microphone needs HTTPS'
    : listening ? 'Send (space)'
    : stoppable || thinking ? 'Stop NOX (esc)'
    : 'Talk',
  )

  const edge = $derived(amber ? 'rgba(var(--nx-wn), 0.8)' : listening ? 'rgba(var(--nx-ac), 0.95)' : mode === 'idle' ? 'rgba(var(--nx-ac), 0.35)' : 'rgba(var(--nx-ac), 0.6)')
  const edgeHover = $derived(stoppable ? 'rgba(var(--nx-wn), 1)' : 'rgba(var(--nx-ac), 0.9)')
  const halo = $derived(amber ? 'rgba(var(--nx-wn), 0.35)' : 'rgba(var(--nx-ac), 0.45)')
  const ink = $derived(amber ? 'rgb(var(--nx-wn))' : 'rgb(var(--nx-fg))')
  const blur = $derived(listening ? '28px' : stoppable ? '20px' : mode === 'speaking' ? '18px' : '10px')
  const glyph = $derived(listening ? 'stop' : thinking ? 'dots' : halted ? 'halted' : stoppable ? 'halt' : 'mic')

  onMount(() => {
    const ring = new MicRing(canvas, () => {
      const v = activeVariant()
      return { mode: viewMode(), amplitude: agent.amplitude, micLevel: agent.micLevel, workProgress: agent.workProgress, haltedAt: mic.haltedAt, colors: { a: v.orbA, b: v.orbB, wn: v.wn } }
    })
    ring.start()
    return () => ring.stop()
  })
</script>

<div class="mic-group">
  <div class="box">
    <canvas bind:this={canvas}></canvas>
    {#if capShow}
      {#key capClosing}
        <div class="capsule" class:closing={capClosing}>
          <span class="sheen"></span>
          <span class="cap-ring"></span>
          <button class="cancel" title="Cancel, nothing is sent (esc)" aria-label="Cancel, don't send" onclick={cancelListening} disabled={capClosing}>
            <span class="top-line"></span>
            <span class="x"><i></i><i></i></span>
          </button>
        </div>
      {/key}
    {/if}
    <button
      class="mic"
      class:listening
      class:unavailable
      class:inert={halted}
      style:--edge={edge}
      style:--edge-hover={edgeHover}
      style:--halo={halo}
      style:--blur={blur}
      style:color={ink}
      title={tip}
      onclick={toggleListening}
    >
      <span class="top-line"></span>
      <span class="inner-ring"></span>
      {#key glyph}
        {#if glyph === 'mic'}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square">
            <rect x="7" y="2" width="6" height="10" rx="3" />
            <path d="M7 6h2M7 8.5h2" />
            <path d="M4 9.5a6 6 0 0 0 12 0" />
            <path d="M10 15.5v2.5M7 18h6" />
          </svg>
        {:else if glyph === 'stop'}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square">
            <path d="M10 16V4.5" />
            <path d="M5 9.5l5-5 5 5" />
          </svg>
        {:else if glyph === 'halt'}
          <span class="halt"><span class="core"></span><span class="halt-ping"></span></span>
        {:else if glyph === 'halted'}
          <span class="halted"></span>
        {:else}
          <span class="dots"><i></i><i></i><i></i></span>
        {/if}
      {/key}
    </button>
  </div>
</div>

<style>
  .mic-group {
    position: relative;
    display: flex;
    align-items: center;
  }
  .capsule {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 164px;
    height: 56px;
    box-sizing: border-box;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.72), rgba(var(--nx-pn), 0.86));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid rgba(var(--nx-ac), 0.22);
    box-shadow:
      0 14px 36px rgba(var(--nx-sh), calc(0.5 * var(--nx-so))),
      inset 0 1px 0 rgba(var(--nx-hi), 0.06);
    overflow: hidden;
    animation: nx-cap-out 0.52s cubic-bezier(0.2, 0.9, 0.25, 1) both;
  }
  .capsule.closing {
    pointer-events: none;
    animation: nx-cap-in 0.4s cubic-bezier(0.6, 0, 0.4, 1) both;
  }
  .sheen {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 22px;
    width: 46px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.28), transparent);
    animation: nx-cap-sheen 0.55s ease-out both;
  }
  .closing .sheen {
    animation: none;
  }
  .cap-ring {
    position: absolute;
    inset: 5px;
    border-radius: 999px;
    border: 1px dashed rgba(var(--nx-ac), 0.1);
  }
  .cancel {
    position: absolute;
    left: 5px;
    top: 5px;
    width: 44px;
    height: 44px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    overflow: hidden;
    background: rgba(var(--nx-mu), 0.1);
    border: 1px solid rgba(var(--nx-ac), 0.3);
    color: rgb(var(--nx-ac));
    cursor: pointer;
    touch-action: manipulation;
    animation: nx-cap-x 0.42s cubic-bezier(0.3, 1.4, 0.5, 1) 0.16s backwards;
    transition:
      border-color 0.2s,
      background 0.2s,
      color 0.2s,
      transform 0.2s;
  }
  .closing .cancel {
    animation: nx-cap-x-out 0.22s ease-in both;
  }
  .cancel:hover {
    border-color: rgba(var(--nx-ac), 0.75);
    background: rgba(var(--nx-mu), 0.2);
    color: rgb(var(--nx-fg));
  }
  .cancel:active {
    transform: scale(0.9);
  }
  .cancel .top-line {
    left: 24%;
    right: 24%;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.5), transparent);
    box-shadow: none;
  }
  .x {
    position: relative;
    width: 12px;
    height: 12px;
    display: block;
  }
  .x i {
    position: absolute;
    left: -1px;
    right: -1px;
    top: 5.5px;
    height: 1.4px;
    background: currentColor;
    transform: rotate(45deg);
  }
  .x i + i {
    transform: rotate(-45deg);
  }
  .box {
    position: relative;
    width: 72px;
    height: 72px;
    flex: none;
  }
  canvas {
    position: absolute;
    left: -34px;
    top: -34px;
    width: 140px;
    height: 140px;
    pointer-events: none;
  }
  .mic {
    position: absolute;
    inset: 8px;
    padding: 0;
    border-radius: 50%;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.86), rgba(var(--nx-pn), 0.94));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid var(--edge);
    box-shadow:
      0 0 var(--blur) var(--halo),
      0 14px 36px rgba(var(--nx-sh), calc(0.5 * var(--nx-so))),
      inset 0 1px 0 rgba(var(--nx-hi), 0.06);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition:
      transform 0.28s cubic-bezier(0.3, 1.6, 0.5, 1),
      box-shadow 0.4s,
      border-color 0.4s,
      color 0.4s;
  }
  .mic:hover {
    border-color: var(--edge-hover);
  }
  .mic:active {
    transform: scale(0.9);
  }
  .mic.listening {
    transform: scale(1.06);
  }
  .mic.inert {
    cursor: default;
  }
  .mic.unavailable {
    opacity: 0.5;
    cursor: default;
  }
  .top-line {
    position: absolute;
    left: 22%;
    right: 22%;
    top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--edge), transparent);
    box-shadow: 0 0 8px var(--edge);
  }
  .inner-ring {
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    border: 1px dashed rgba(var(--nx-ac), 0.14);
    pointer-events: none;
  }
  svg {
    display: block;
    filter: drop-shadow(0 0 4px rgba(var(--nx-ac), 0.6));
    animation: nx-glyph 0.3s ease both;
  }
  .halt {
    position: relative;
    width: 18px;
    height: 18px;
    box-sizing: border-box;
    border: 1.5px solid currentColor;
    border-radius: 5px;
    display: grid;
    place-items: center;
    animation: nx-glyph 0.3s ease both;
  }
  .core {
    width: 6px;
    height: 6px;
    border-radius: 1.5px;
    background: currentColor;
  }
  .halt-ping {
    position: absolute;
    inset: -5px;
    border-radius: 8px;
    border: 1px solid currentColor;
    opacity: 0.5;
    animation: nx-ping 1.6s ease-out infinite;
  }
  .halted {
    width: 16px;
    height: 2px;
    border-radius: 1px;
    background: currentColor;
    box-shadow: 0 0 10px currentColor;
    animation: nx-glyph 0.3s ease both;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: nx-blink 1s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }
</style>
