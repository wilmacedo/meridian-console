<script lang="ts">
  import { viewMode } from '../agent/agent-state.svelte'
  import { cancelListening, mic, toggleListening } from '../voice/microphone.svelte'
  import { carGeometry } from './car.svelte'

  const g = $derived(carGeometry())
  const listening = $derived(viewMode() === 'listening')

  // The counter only needs to move once a second.
  let now = $state(performance.now())
  $effect(() => {
    if (!listening) return
    now = performance.now()
    const timer = setInterval(() => (now = performance.now()), 500)
    return () => clearInterval(timer)
  })
  const seconds = $derived(Math.max(0, Math.floor((now - mic.since) / 1000)))
  const time = $derived(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`)
</script>

{#if listening}
  <div class="bar" style:height="{g.bar}px">
    <button class="cancel" style:width="{Math.round(g.bar * 2.6)}px" aria-label="Cancel, don't send" onclick={cancelListening}>
      <span class="x"><i></i><i></i></span>
      <span>CANCEL</span>
    </button>
    <button class="send" aria-label="Send to NOX" onclick={() => void toggleListening()}>
      <span class="top-line"></span>
      <span class="rec"><i></i><span>{time}</span></span>
      <span class="go">
        <span>SEND</span>
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square">
          <path d="M10 16V4.5" />
          <path d="M5 9.5l5-5 5 5" />
        </svg>
      </span>
    </button>
  </div>
{/if}

<style>
  .bar {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 7;
    display: flex;
    align-items: stretch;
    gap: 8px;
    animation: nx-sub 0.3s ease both;
  }
  button {
    display: flex;
    align-items: center;
    padding: 0;
    border-radius: 14px;
    color: rgb(var(--nx-fg));
    font-family: var(--font-mono);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    transition:
      background 0.2s,
      transform 0.2s;
  }
  .cancel {
    flex: none;
    justify-content: center;
    gap: 14px;
    background: rgba(var(--nx-pn), 0.8);
    border: 1px solid rgba(var(--nx-ac), 0.3);
    font-size: 14px;
    letter-spacing: 0.18em;
  }
  .cancel:active {
    transform: scale(0.97);
    background: rgba(var(--nx-mu), 0.22);
  }
  .x {
    position: relative;
    width: 14px;
    height: 14px;
    flex: none;
  }
  .x i {
    position: absolute;
    left: -2px;
    right: -2px;
    top: 6.5px;
    height: 1.5px;
    background: currentColor;
    transform: rotate(45deg);
  }
  .x i + i {
    transform: rotate(-45deg);
  }
  .send {
    position: relative;
    flex: 1;
    min-width: 0;
    justify-content: space-between;
    gap: 16px;
    padding: 0 26px;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(var(--nx-ac), 0.22), rgba(var(--nx-ac), 0.12));
    border: 1px solid rgba(var(--nx-ac), 0.85);
    box-shadow:
      0 0 26px rgba(var(--nx-ac), 0.28),
      inset 0 1px 0 rgba(var(--nx-hi), 0.12);
  }
  .send:active {
    transform: scale(0.985);
    background: rgba(var(--nx-ac), 0.3);
  }
  .top-line {
    position: absolute;
    left: 18%;
    right: 18%;
    top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgb(var(--nx-ac)), transparent);
  }
  .rec {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.9);
  }
  .rec i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgb(var(--nx-fg));
    box-shadow: 0 0 10px rgb(var(--nx-ac));
    animation: nx-blink 1s ease-in-out infinite;
  }
  .go {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 17px;
    font-weight: 500;
    letter-spacing: 0.22em;
  }
  svg {
    display: block;
    filter: drop-shadow(0 0 6px rgba(var(--nx-ac), 0.9));
  }
</style>
