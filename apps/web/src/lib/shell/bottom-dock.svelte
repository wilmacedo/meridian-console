<script lang="ts">
  import { agent } from '../agent/agent-state.svelte'
  import { live } from '../live/stream.svelte'
  import { micAvailable, toggleListening } from '../voice/microphone.svelte'
  import type { ModuleDef } from '../modules'
  import { visibleModules } from '../workspace/prefs.svelte'
  import { isOpen, openModule } from '../windows/window-manager.svelte'

  const modules = $derived(visibleModules())
  const half = $derived(Math.ceil(modules.length / 2))
  const left = $derived(modules.slice(0, half))
  const right = $derived(modules.slice(half))

  const thinking = $derived(agent.mode === 'thinking')
  const stateColor = $derived(thinking ? 'rgb(var(--nx-fg))' : 'rgb(var(--nx-ac))')
</script>

{#snippet moduleButton(m: ModuleDef)}
  {@const active = isOpen(m.id)}
  <button class="module" class:active onclick={() => openModule(m.id)}>
    <span>{m.label.toUpperCase()}</span>
    <span class="bar"></span>
  </button>
{/snippet}

<nav>
  <div class="side left">
    {#each left as m (m.id)}{@render moduleButton(m)}{/each}
  </div>
  <div class="mic-group">
    <div class="spacer"></div>
    <button class="mic" class:thinking style:--state={stateColor} title={live.link === 'offline' ? 'Offline: NOX cannot hear you right now' : micAvailable() ? 'Talk (space)' : 'The microphone needs HTTPS (see docs/https.md)'} class:unavailable={!micAvailable() || live.link === 'offline'} onclick={toggleListening}>
      {#if agent.mode === 'listening'}
        <span class="ping"></span>
        <span class="ping late"></span>
      {/if}
      <span class="glyph">
        <span class="capsule"></span>
        <span class="cradle"></span>
        <span class="stem"></span>
      </span>
    </button>
    <div class="spacer"></div>
  </div>
  <div class="side right">
    {#each right as m (m.id)}{@render moduleButton(m)}{/each}
  </div>
</nav>

<style>
  nav {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 26px;
    z-index: 6;
    padding: 0 20px;
  }
  .side {
    flex: 1;
    display: flex;
    gap: 22px;
    min-width: 0;
  }
  .left {
    justify-content: flex-end;
  }
  .right {
    justify-content: flex-start;
  }
  .module {
    background: none;
    border: none;
    padding: 8px 2px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.55);
    transition: color 0.3s;
  }
  .module:hover,
  .module.active {
    color: rgb(var(--nx-fg));
  }
  .bar {
    width: 0;
    height: 1px;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 6px rgb(var(--nx-ac));
    transition: width 0.35s;
  }
  .active .bar {
    width: 100%;
  }
  .mic-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .spacer {
    width: 34px;
  }
  .mic {
    --core: rgba(var(--nx-ac), 0.4);
    --inner: rgba(var(--nx-ac), 0.45);
    position: relative;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--core) 0%, rgba(var(--nx-pn), 0.85) 70%);
    border: 1.5px solid var(--state);
    box-shadow:
      0 0 18px var(--state),
      inset 0 0 14px var(--inner);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition:
      box-shadow 0.4s,
      border-color 0.4s;
  }
  .mic.unavailable {
    opacity: 0.5;
    cursor: default;
  }
  .mic.thinking {
    --core: rgba(var(--nx-wn), 0.35);
    --inner: rgba(var(--nx-wn), 0.4);
  }
  .ping {
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 1px solid rgb(var(--nx-ac));
    animation: nx-ping 1.2s ease-out infinite;
  }
  .ping.late {
    animation-delay: 0.6s;
  }
  .glyph {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .capsule {
    width: 8px;
    height: 14px;
    border: 1.5px solid rgb(var(--nx-fg));
    border-radius: 5px;
  }
  .cradle {
    width: 12px;
    height: 5px;
    border: 1.5px solid rgb(var(--nx-fg));
    border-top: none;
    border-radius: 0 0 7px 7px;
    margin-top: -5px;
  }
  .stem {
    width: 1.5px;
    height: 3px;
    background: rgb(var(--nx-fg));
  }
</style>
