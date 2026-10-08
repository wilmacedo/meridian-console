<script lang="ts">
  import type { ModuleDef } from '../modules'
  import { visibleModules } from '../workspace/prefs.svelte'
  import { isOpen, openModule } from '../windows/window-manager.svelte'
  import { viewMode } from '../agent/agent-state.svelte'
  import MicButton from './mic-button.svelte'

  const listening = $derived(viewMode() === 'listening')
  const modules = $derived(visibleModules())
  const half = $derived(Math.ceil(modules.length / 2))
  const left = $derived(modules.slice(0, half))
  const right = $derived(modules.slice(half))
</script>

{#snippet moduleButton(m: ModuleDef)}
  {@const active = isOpen(m.id)}
  <button class="module" class:active onclick={() => openModule(m.id)}>
    <span>{m.label.toUpperCase()}</span>
    <span class="bar"></span>
  </button>
{/snippet}

<nav>
  <div class="side left" class:away={listening}>
    {#each left as m (m.id)}{@render moduleButton(m)}{/each}
  </div>
  <MicButton />
  <div class="side right" class:away={listening}>
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
  /* The recording capsule opens over the modules beside the mic. */
  .side {
    transition: opacity 0.3s ease;
  }
  .away {
    opacity: 0;
    pointer-events: none;
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
</style>
